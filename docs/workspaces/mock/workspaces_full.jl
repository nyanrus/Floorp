# ワークスペース全体の Julia モック（spec-next.md ＋ research-essential-tabs.md 準拠）
#
# 範囲: ストア(v4/v2/11.x)・スナップショット・復旧 / 作成・改名・削除・アーカイブ・復元 /
#       切り替え・フォーカス規則 / タブを開く(コンテナ規則) / 最後のタブ / ピン留め・Essential /
#       ウィンドウ閉じ・再起動・セッション / 別ウィンドウへの移動(分割維持)
# 範囲外: Firefox 本体の実描画、拡張機能、プライベートウィンドウ。
#
# 添字は begin / end / first / last / lastindex / circshift で書き、`+1` `[1]` を使わない。
# 実行: julia workspaces_full.jl   （Julia 1.9 以降を想定。UUIDs と Test は標準ライブラリ）

using Test
using UUIDs

# ====================================================================
# 型
# ====================================================================

const Id = String
const MAX_SNAPSHOTS = 3
const UUID_RE = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"i

make_id(n::Integer) = string(UUID(UInt128(n)))
clean_id(s::AbstractString) = String(replace(s, r"[{}]" => ""))
valid_id(s::AbstractString) = occursin(UUID_RE, clean_id(s))

mutable struct Workspace
    id::Id
    name::String
    user_context_id::Int                    # 0 = コンテナなし
    icon::Union{String,Nothing}
end

mutable struct Store
    schema_version::Int
    default_id::Id
    data::Dict{Id,Workspace}
    order::Vector{Id}
end

fresh_store(id::Id) =
    Store(2, id, Dict(id => Workspace(id, "New Workspace (0)", 0, nothing)), [id])

mutable struct Tab
    id::Int
    url::String
    workspace_id::Union{Id,Nothing}         # floorpWorkspaceId。Essential は nothing
    user_context_id::Int
    pinned::Bool
    essential::Bool                         # floorpEssential。pinned とセットで意味を持つ
    hidden::Bool
    last_shown::Bool
    split_group::Union{Int,Nothing}         # floorpSplitViewGroupId
end

Tab(id::Int, url::String; ws = nothing, ctx = 0, pinned = false, essential = false, split = nothing) =
    Tab(id, url, ws, ctx, pinned, essential, false, false, split)

mutable struct Window
    id::Int
    tabs::Vector{Tab}
    current_ws::Id                          # ウィンドウごとの選択（ストアには入れない）
    selected::Union{Int,Nothing}            # 選択中のタブ ID
    closed::Bool
end

"SessionStore に残るウィンドウの状態。"
struct WinState
    tabs::Vector{Tab}
    current_ws::Id
    selected::Union{Int,Nothing}
end

struct TabRef
    url::String
    user_context_id::Int
    pinned::Bool
end

abstract type ArchivedItem end
struct ArchivedWorkspace <: ArchivedItem
    workspace::Workspace
    tabs::Vector{TabRef}
    at::Int
end
struct ClosedTabs <: ArchivedItem            # 「前回の復元」が無効のときの最近閉じたタブ
    tabs::Vector{TabRef}
    at::Int
end
archived_at(x::ArchivedItem) = x.at

Base.@kwdef mutable struct Settings
    exit_on_last_tab_close::Bool = false     # 既存
    stay_on_last_tab_close::Bool = false     # 新設定
    focus_existing_window::Bool = false      # 新設定
    retention_days::Int = 30                 # 新設定（1〜365）
    restore_session::Bool = true             # browser.startup.page == 3
end

Base.@kwdef mutable struct Profile
    store::Store = fresh_store(make_id(1))
    pref::Any = nothing                      # floorp.workspaces.v4.store（正本）
    snapshots::Vector{Dict{String,Any}} = Dict{String,Any}[]   # 新しい順、最大 3 世代
    archive::Vector{ArchivedItem} = ArchivedItem[]
    settings::Settings = Settings()
    windows::Vector{Window} = Window[]
    session::Vector{WinState} = WinState[]
    today::Int = 0
    next_id::Int = 2
    next_tab::Int = 0
    next_win::Int = 0
    focused::Union{Int,Nothing} = nothing    # フォーカスを移されたウィンドウ
    log::Vector{String} = String[]
end

function next_id!(p::Profile)
    id = make_id(p.next_id)
    p.next_id += 1
    id
end
next_tab!(p::Profile) = (p.next_tab += 1)
next_win!(p::Profile) = (p.next_win += 1)

# ====================================================================
# ストア：符号化・復号・保存・復旧・移行
# ====================================================================

ws_dict(w::Workspace) = Dict{String,Any}(
    "name" => w.name, "userContextId" => w.user_context_id, "icon" => w.icon)

encode_store(s::Store) = Dict{String,Any}(
    "schemaVersion" => s.schema_version,
    "defaultID" => s.default_id,
    "data" => [id => ws_dict(s.data[id]) for id in s.order],
    "order" => copy(s.order))

"v4（schemaVersion なし）も v2 も読める。壊れていれば nothing。"
function decode_store(raw)::Union{Store,Nothing}
    try
        raw isa AbstractDict || return nothing
        all(haskey(raw, k) for k in ("defaultID", "data", "order")) || return nothing
        get(raw, "schemaVersion", 4) in (2, 4) || return nothing   # 未知の版は読まない

        data = Dict{Id,Workspace}()
        for (id, w) in raw["data"]
            valid_id(id) || return nothing
            haskey(w, "name") || return nothing
            cid = clean_id(id)
            data[cid] = Workspace(cid, w["name"], get(w, "userContextId", 0), get(w, "icon", nothing))
        end
        order = Id[clean_id(i) for i in raw["order"]]
        default_id = clean_id(raw["defaultID"])
        (haskey(data, default_id) && all(in(keys(data)), order) && !isempty(order)) || return nothing
        Store(2, default_id, data, order)
    catch
        nothing
    end
end

"""
Floorp 11.x の Workspaces.json から移行する。
現行実装は「開いているタブが使っている ID」だけを移すが、spec 7.2 に従い**全部**移す。
（実際の JSON は挿入順を保つが、このモックの Dict は順序を持たないので order は不定。）
"""
function migrate_v11(raw::AbstractDict)::Union{Store,Nothing}
    data = Dict{Id,Workspace}()
    order = Id[]
    default_id = nothing
    preferred = nothing
    for (_, win) in raw["windows"], (key, entry) in win
        if key == "preferences"
            cand = clean_id(get(entry, "selectedWorkspaceId", get(entry, "defaultWorkspace", "")))
            isempty(cand) || (preferred = cand)
            continue
        end
        haskey(entry, "id") || continue
        id = clean_id(entry["id"])
        (valid_id(id) && !haskey(data, id)) || continue
        data[id] = Workspace(id, entry["name"], get(entry, "userContextId", 0), get(entry, "icon", nothing))
        push!(order, id)
        get(entry, "defaultWorkspace", false) && default_id === nothing && (default_id = id)
    end
    isempty(order) && return nothing
    from_pref = preferred !== nothing && haskey(data, preferred) ? preferred : nothing
    Store(2, something(default_id, from_pref, first(order)), data, order)
end

"""
スナップショットを書く。`fail=true` は一時ファイルへの書き込み失敗（直前の世代を残す）。
pref の更新は成功する。リネーム前に失敗するのでスナップショットだけが増えない。
"""
function save!(p::Profile; fail::Bool = false)
    p.pref = encode_store(p.store)
    fail && return false
    pushfirst!(p.snapshots, deepcopy(p.pref))
    p.snapshots = p.snapshots[begin:min(end, MAX_SNAPSHOTS)]
    true
end

"起動時の読み込み。pref → 最新の有効なスナップショット → 新規、の順。"
function load!(p::Profile)::Symbol
    s = decode_store(p.pref)
    source = :pref
    if s === nothing
        for snap in p.snapshots
            s = decode_store(snap)
            s === nothing || break
        end
        source = s === nothing ? :fresh : :snapshot
        s === nothing && (s = fresh_store(next_id!(p)))
        push!(p.log, "store recovered from $source")
    end
    v4 = source == :pref && get(p.pref, "schemaVersion", 4) == 4
    v4 && pushfirst!(p.snapshots, deepcopy(p.pref))     # 変換前の v4 を 1 世代残す（旧 .bak の代わり）
    p.store = s
    (source != :pref || v4) && save!(p)
    source
end

# ====================================================================
# タブ・表示の基本
# ====================================================================

is_essential(t::Tab) = t.pinned && t.essential

"Firefox の hideTab は pinned と選択中タブを拒否する。"
should_hide(t::Tab, current::Id, selected) =
    !(t.pinned || t.id == selected) && t.workspace_id !== nothing && t.workspace_id != current

update_visibility!(w::Window) =
    foreach(t -> t.hidden = should_hide(t, w.current_ws, w.selected), w.tabs)

function selected_tab(w::Window)
    w.selected === nothing && return nothing
    i = findfirst(t -> t.id == w.selected, w.tabs)
    i === nothing ? nothing : w.tabs[i]
end

function tab_by_id(w::Window, id::Int)
    i = findfirst(t -> t.id == id, w.tabs)
    i === nothing ? throw(KeyError(id)) : w.tabs[i]
end

"Essential は数えない。「そのワークスペースが空か」の判定に使う。"
regular_count(w::Window, ws::Id) = count(t -> !is_essential(t) && t.workspace_id == ws, w.tabs)

"Essential → 通常のピン留め → その他、の順に安定して並べる（moveTabTo のクランプの代わり）。"
function normalize_order!(w::Window)
    rank(t) = is_essential(t) ? 1 : t.pinned ? 2 : 3
    sort!(w.tabs; by = rank, alg = MergeSort)
end

to_ref(t::Tab) = TabRef(t.url, t.user_context_id, t.pinned)

"切り替え先で選ぶタブ：選択中 → 最後に見たタブ → 先頭。無ければ nothing。"
function pick_tab_for(w::Window, ws::Id)
    mine = filter(t -> !is_essential(t) && t.workspace_id == ws, w.tabs)
    isempty(mine) && return nothing
    sel = selected_tab(w)
    sel !== nothing && any(t -> t === sel, mine) && return sel
    i = findfirst(t -> t.last_shown, mine)
    i === nothing ? first(mine) : mine[i]
end

"削除・移動・復元のあとに、ウィンドウを整合した状態へ戻す。"
function settle!(p::Profile, w::Window)
    haskey(p.store.data, w.current_ws) || (w.current_ws = p.store.default_id)
    sel = selected_tab(w)
    if !(sel !== nothing && (sel.pinned || sel.workspace_id == w.current_ws))
        pick = pick_tab_for(w, w.current_ws)
        pick === nothing && (pick = open_tab!(p, w, "about:newtab"; select = false))
        w.selected = pick.id
    end
    update_visibility!(w)
end

"所属の無い・不明な ID のタブは、ウィンドウの現在のワークスペースが引き取る。"
function adopt_orphans!(p::Profile, w::Window)
    haskey(p.store.data, w.current_ws) || (w.current_ws = p.store.default_id)
    for t in w.tabs
        is_essential(t) && continue
        known = t.workspace_id !== nothing && haskey(p.store.data, t.workspace_id)
        known || (t.workspace_id = w.current_ws)
    end
end

# ====================================================================
# タブを開く：どの経路も同じ規則（T4）
# ====================================================================

"既定コンテナの入口は 1 つだけ。明示指定があればそれを優先する。"
resolve_container(p::Profile, w::Window; explicit = nothing) =
    explicit !== nothing ? explicit : p.store.data[w.current_ws].user_context_id

function open_tab!(p::Profile, w::Window, url::String; ctx = nothing, select::Bool = true)
    t = Tab(next_tab!(p), url; ws = w.current_ws, ctx = resolve_container(p, w; explicit = ctx))
    push!(w.tabs, t)
    select && (w.selected = t.id)
    normalize_order!(w)
    update_visibility!(w)
    t
end

const OPEN_PATHS = (:new_tab, :urlbar, :command_palette, :bookmark, :link_menu, :first_tab)

"経路ごとの入口。全部 open_tab! に集約されることがテストの対象。"
open_from!(p::Profile, w::Window, ::Val{path}, url) where {path} = open_tab!(p, w, url)
open_from!(p::Profile, w::Window, path::Symbol, url) = open_from!(p, w, Val(path), url)

"外部リンク（ウィンドウが無い・未準備）。既定ワークスペースを直接読む。"
function open_external!(p::Profile, url::String)
    isempty(p.windows) ? open_window!(p; url = url) : open_tab!(p, last(p.windows), url)
end

# ====================================================================
# ウィンドウ
# ====================================================================

function open_window!(p::Profile; ws::Id = p.store.default_id, url::String = "about:newtab")
    w = Window(next_win!(p), Tab[], ws, nothing, false)
    push!(p.windows, w)
    open_tab!(p, w, url)
    w
end

function close_window!(p::Profile, w::Window)
    w.closed = true
    push!(p.session, WinState(deepcopy(w.tabs), w.current_ws, w.selected))
    filter!(x -> x !== w, p.windows)
    nothing
end

# ====================================================================
# 切り替え・最後のタブ
# ====================================================================

function mark_last_shown!(w::Window, tab::Tab)
    for t in w.tabs
        t.workspace_id == tab.workspace_id && (t.last_shown = false)
    end
    tab.last_shown = true
end

"""
切り替えは表示中のウィンドウにだけ効く。
`focus_existing_window` が有効で、他のウィンドウが同じワークスペースを開いていれば、そちらへフォーカスする（T2）。
"""
function switch!(p::Profile, w::Window, ws_id::Id)::Symbol
    haskey(p.store.data, ws_id) || throw(KeyError(ws_id))
    if p.settings.focus_existing_window
        i = findfirst(v -> v !== w && v.current_ws == ws_id, p.windows)
        if i !== nothing
            p.focused = p.windows[i].id
            return :focused_other
        end
    end
    prev = selected_tab(w)
    prev !== nothing && prev.workspace_id !== nothing && mark_last_shown!(w, prev)
    w.current_ws = ws_id
    pick = pick_tab_for(w, ws_id)
    pick === nothing && (pick = open_tab!(p, w, "about:newtab"; select = false))
    w.selected = pick.id
    update_visibility!(w)
    :switched
end

"隣のワークスペース。`circshift` で一つずらした列と対応づけるので、添字の加減算がいらない。"
function neighbor(order::Vector{Id}, cur::Id, step::Int)
    shifted = circshift(order, step > 0 ? -1 : 1)
    shifted[findfirst(==(cur), order)]
end

abstract type CloseAction end
struct SwitchTo <: CloseAction
    workspace_id::Id
end
struct KeepWithNewTab <: CloseAction end
struct CloseWindow <: CloseAction end

"最後のタブを閉じたときの方針（T5）。まだタブが残るなら nothing。"
function on_last_tab_closed(w::Window, closing::Tab, s::Settings, order::Vector{Id})
    is_essential(closing) && return nothing
    ws = closing.workspace_id
    (ws === nothing || ws != w.current_ws) && return nothing
    regular_count(w, ws) > 0 && return nothing
    s.stay_on_last_tab_close && return KeepWithNewTab()     # 新設定：勝手に移らない
    s.exit_on_last_tab_close && return CloseWindow()
    others = filter(o -> o != ws && regular_count(w, o) > 0, order)
    isempty(others) ? KeepWithNewTab() : SwitchTo(first(others))   # 現行の挙動
end

execute!(::Profile, ::Window, ::Nothing) = nothing
execute!(p::Profile, w::Window, a::SwitchTo) = switch!(p, w, a.workspace_id)
execute!(p::Profile, w::Window, ::KeepWithNewTab) = open_tab!(p, w, "about:newtab")
execute!(p::Profile, w::Window, ::CloseWindow) = close_window!(p, w)

"選択中のタブが閉じたときの後継：残った可視タブのうち、同じ位置以降で最初のもの、無ければ最後。"
function successor(w::Window, i::Int)
    visible = [j for (j, t) in pairs(w.tabs) if !t.hidden]
    isempty(visible) && return nothing
    k = something(findfirst(>=(i), visible), lastindex(visible))
    w.tabs[visible[k]].id
end

function close_tab!(p::Profile, w::Window, tab_id::Int)
    i = findfirst(t -> t.id == tab_id, w.tabs)
    i === nothing && return nothing
    closing = w.tabs[i]
    was_selected = w.selected == tab_id
    deleteat!(w.tabs, i)
    was_selected && (w.selected = successor(w, i))
    action = on_last_tab_closed(w, closing, p.settings, p.store.order)
    update_visibility!(w)
    execute!(p, w, action)
    action
end

# ====================================================================
# ピン留め・Essential・移動
# ====================================================================

function pin!(w::Window, id::Int)
    tab_by_id(w, id).pinned = true
    normalize_order!(w)
end

"""
Essential ＝ ピン留め ＋ 印。所属は持たない（最後のタブ判定に数えないため）。
Firefox 側は pinned を hideTab しないので、切り替えても常に見える。
"""
function make_essential!(p::Profile, w::Window, id::Int)
    t = tab_by_id(w, id)
    t.pinned = true
    t.essential = true
    t.workspace_id = nothing
    normalize_order!(w)
    settle!(p, w)
end

function unpin!(p::Profile, w::Window, id::Int)
    t = tab_by_id(w, id)
    t.pinned = false
    t.essential = false
    t.workspace_id === nothing && (t.workspace_id = w.current_ws)
    normalize_order!(w)
    settle!(p, w)
end

function move_tab!(p::Profile, w::Window, id::Int, ws_id::Id)::Bool
    t = tab_by_id(w, id)
    is_essential(t) && return false          # Essential はワークスペース間を移さない
    t.workspace_id = ws_id
    settle!(p, w)
    true
end

"""
別ウィンドウへ移す。adoptTab は独自属性を落とすので、ここで所属・Essential の印・分割をコピーする。
分割のうち一部だけが移る場合は分割を解除し、ログに残す（通知の代わり）。
"""
function transfer_tabs!(p::Profile, from::Window, to::Window, ids)
    moving = Set(ids)
    moved = [t for t in from.tabs if t.id in moving]
    groups = Set(t.split_group for t in moved if t.split_group !== nothing)
    broken = Int[g for g in groups if !all(in(moving), (t.id for t in from.tabs if t.split_group == g))]
    filter!(t -> !(t.id in moving), from.tabs)
    append!(to.tabs, moved)
    for t in vcat(from.tabs, to.tabs)
        t.split_group in broken && (t.split_group = nothing)
    end
    isempty(broken) || push!(p.log, "split view lost: $(join(sort(broken), ","))")
    normalize_order!(to)
    settle!(p, from)
    settle!(p, to)
    broken
end

# ====================================================================
# ワークスペースの CRUD・アーカイブ
# ====================================================================

function create_workspace!(p::Profile, name::String; user_context_id::Int = 0,
                           icon = nothing, id::Id = next_id!(p))
    p.store.data[id] = Workspace(id, name, user_context_id, icon)
    push!(p.store.order, id)
    save!(p)
    id
end

create_and_switch!(p::Profile, w::Window, name::String; kw...) =
    (id = create_workspace!(p, name; kw...); switch!(p, w, id); id)

function rename!(p::Profile, id::Id, name::String)
    p.store.data[id].name = name                 # ID は変えない
    save!(p)
end

"削除はアーカイブへ移す。最後の 1 つは消せない。"
function delete_workspace!(p::Profile, id::Id)::Bool
    length(p.store.order) > 1 || return false
    ws = p.store.data[id]
    refs = TabRef[]
    for w in p.windows
        append!(refs, to_ref(t) for t in w.tabs if t.workspace_id == id)
        filter!(t -> t.workspace_id != id, w.tabs)
    end
    push!(p.archive, ArchivedWorkspace(ws, refs, p.today))
    delete!(p.store.data, id)
    filter!(!=(id), p.store.order)
    p.store.default_id == id && (p.store.default_id = first(p.store.order))
    for w in p.windows
        selected_tab(w) === nothing && (w.selected = nothing)   # 消えたタブを指したままにしない
        settle!(p, w)
    end
    save!(p)
    true
end

restore!(p::Profile, w::Window, i::Integer) = restore!(p, w, popat!(p.archive, i))

function restore!(p::Profile, w::Window, item::ArchivedWorkspace)
    ws = item.workspace
    id = haskey(p.store.data, ws.id) ? next_id!(p) : ws.id     # 衝突したら新しい ID
    p.store.data[id] = Workspace(id, ws.name, ws.user_context_id, ws.icon)
    push!(p.store.order, id)
    for r in item.tabs
        push!(w.tabs, Tab(next_tab!(p), r.url; ws = id, ctx = r.user_context_id, pinned = r.pinned))
    end
    normalize_order!(w)
    settle!(p, w)
    save!(p)
    id
end

function restore!(p::Profile, w::Window, item::ClosedTabs)
    for r in item.tabs
        push!(w.tabs, Tab(next_tab!(p), r.url; ws = w.current_ws, ctx = r.user_context_id, pinned = r.pinned))
    end
    normalize_order!(w)
    settle!(p, w)
    nothing
end

function set_retention!(p::Profile, days::Integer)
    1 <= days <= 365 || throw(ArgumentError("retention_days must be 1..365 (0 は不可)"))
    p.settings.retention_days = days
end

"完全削除はアーカイブ内からのみ、確認つき。"
function purge!(p::Profile, i::Integer; confirmed::Bool = false)::Bool
    confirmed || return false
    deleteat!(p.archive, i)
    true
end

purge_expired!(p::Profile) =
    filter!(x -> p.today - archived_at(x) < p.settings.retention_days, p.archive)

function advance_days!(p::Profile, n::Integer)
    p.today += n
    purge_expired!(p)
end

reset_settings!(p::Profile) = (p.settings = Settings(); nothing)

# ====================================================================
# 起動・終了・再起動
# ====================================================================

function start!(p::Profile)::Symbol
    source = load!(p)
    states = p.session
    p.session = WinState[]
    if p.settings.restore_session
        for st in states
            w = Window(next_win!(p), deepcopy(st.tabs), st.current_ws, st.selected, false)
            adopt_orphans!(p, w)
            push!(p.windows, w)
            settle!(p, w)
        end
    else
        refs = TabRef[to_ref(t) for st in states for t in st.tabs]
        isempty(refs) || push!(p.archive, ClosedTabs(refs, p.today))   # 消さずに退避
    end
    isempty(p.windows) && open_window!(p)
    source
end

quit!(p::Profile) = foreach(w -> close_window!(p, w), copy(p.windows))

restart!(p::Profile) = (quit!(p); start!(p))

function new_profile(; settings::Settings = Settings())
    p = Profile(; settings = settings)
    save!(p)
    start!(p)
    p
end

# ====================================================================
# テスト
# ====================================================================

function sample(settings::Settings = Settings())
    p = new_profile(; settings)
    w = first(p.windows)
    a = first(p.store.order)
    rename!(p, a, "仕事")
    b = create_workspace!(p, "私用"; user_context_id = 2)
    (p, w, a, b)
end

visible_ids(w) = [t.id for t in w.tabs if !t.hidden]

@testset "保存と復旧" begin
    @testset "T1 定義はどの設定でも再起動後に残る" begin
        for s in (Settings(), Settings(exit_on_last_tab_close = true),
                  Settings(stay_on_last_tab_close = true, focus_existing_window = true),
                  Settings(restore_session = false))
            p, _, _, _ = sample(s)
            before = encode_store(p.store)
            restart!(p)
            @test encode_store(p.store) == before
        end
    end

    @testset "T7 設定の変更は再起動後も残り、既定に戻せる" begin
        p, _, _, _ = sample()
        set_retention!(p, 7)
        p.settings.stay_on_last_tab_close = true
        restart!(p)
        @test p.settings.retention_days == 7 && p.settings.stay_on_last_tab_close
        reset_settings!(p)
        @test p.settings.retention_days == 30 && !p.settings.stay_on_last_tab_close
        @test_throws ArgumentError set_retention!(p, 0)
        @test_throws ArgumentError set_retention!(p, 366)
    end

    @testset "T8 v4 と 11.x を読み込んで同じ内容が再現される" begin
        a, b = make_id(10), make_id(11)
        p = Profile()
        p.pref = Dict{String,Any}(
            "defaultID" => "{$a}",
            "data" => ["{$a}" => Dict{String,Any}("name" => "仕事", "userContextId" => 1),
                       b => Dict{String,Any}("name" => "私用")],
            "order" => [a, b])
        @test start!(p) == :pref
        @test p.store.schema_version == 2 && p.store.default_id == a
        @test p.store.data[a].user_context_id == 1 && p.store.data[b].user_context_id == 0
        @test !haskey(p.snapshots[end], "schemaVersion")          # 変換前の v4 が残る

        raw = Dict{String,Any}("windows" => Dict{String,Any}("w1" => Dict{String,Any}(
            "k1" => Dict{String,Any}("id" => "{$a}", "name" => "仕事", "tabs" => [],
                                     "defaultWorkspace" => false, "icon" => "briefcase", "userContextId" => 1),
            "k2" => Dict{String,Any}("id" => b, "name" => "私用", "tabs" => [],
                                     "defaultWorkspace" => true, "icon" => nothing),
            "preferences" => Dict{String,Any}("selectedWorkspaceId" => "{$a}"))))
        s = migrate_v11(raw)
        @test Set(s.order) == Set([a, b]) && s.default_id == b
        @test s.data[a].icon == "briefcase"
    end

    @testset "T10 pref が壊れてもスナップショットから復旧する" begin
        p, _, a, b = sample()
        before = encode_store(p.store)
        p.pref = Dict("garbage" => 1)
        @test restart!(p) == :snapshot
        @test encode_store(p.store) == before
        @test decode_store(p.pref) !== nothing                    # pref も直る
    end

    @testset "保存が途中で失敗したら直前の世代を残す・世代は 3 まで" begin
        p, _, _, _ = sample()
        for n in 1:5
            create_workspace!(p, "ws$n")
        end
        @test length(p.snapshots) == MAX_SNAPSHOTS
        gens = length(p.snapshots)
        newest = deepcopy(p.snapshots[begin])
        p.store.data[last(p.store.order)].name = "壊れかけ"
        @test !save!(p; fail = true)
        @test length(p.snapshots) == gens && p.snapshots[begin] == newest
        p.pref = nothing
        @test restart!(p) == :snapshot
        @test p.store.data[last(p.store.order)].name == "ws5"
    end
end

@testset "切り替えとウィンドウ" begin
    @testset "T2 同じワークスペースが開いていれば既存ウィンドウへ（opt-in）" begin
        p, w1, a, b = sample()
        w2 = open_window!(p)
        @test switch!(p, w2, a) == :switched                      # 既定は独立に選べる
        p.settings.focus_existing_window = true
        switch!(p, w1, b)
        @test switch!(p, w2, b) == :focused_other && p.focused == w1.id
        @test w2.current_ws == a
    end

    @testset "T3 ウィンドウを閉じても他ウィンドウのタブは隠れない" begin
        p, w1, a, b = sample()
        w2 = open_window!(p; ws = b)
        open_tab!(p, w2, "https://example.org")
        before = visible_ids(w2)
        close_window!(p, w1)
        @test visible_ids(w2) == before
        @test length(p.store.order) == 2
    end

    @testset "切り替えで最後に見ていたタブに戻る・周回する" begin
        p, w, a, b = sample()
        t1 = open_tab!(p, w, "a1"); t2 = open_tab!(p, w, "a2")
        select_a = t1.id; w.selected = select_a
        switch!(p, w, b)
        @test all(t -> t.hidden == (t.workspace_id == a && !t.pinned), w.tabs)
        switch!(p, w, a)
        @test w.selected == select_a
        @test neighbor(p.store.order, a, +1) == b && neighbor(p.store.order, a, -1) == b
        @test neighbor(p.store.order, b, +1) == p.store.order[begin]
    end

    @testset "T5 最後のタブを閉じたとき" begin
        p, w, a, b = sample()
        switch!(p, w, b)
        open_tab!(p, w, "b-only")
        switch!(p, w, a)
        for t in copy(w.tabs)
            t.workspace_id == a && close_tab!(p, w, t.id)
        end
        @test w.current_ws == b                                   # 既定の挙動：別ワークスペースへ移る

        p, w, a, b = sample(Settings(stay_on_last_tab_close = true))
        switch!(p, w, b); open_tab!(p, w, "x"); switch!(p, w, a)
        for t in copy(w.tabs)
            t.workspace_id == a && close_tab!(p, w, t.id)
        end
        @test w.current_ws == a && regular_count(w, a) == 1       # 留まり、空の置換タブが立つ

        p, w, a, b = sample(Settings(exit_on_last_tab_close = true))
        close_tab!(p, w, only(w.tabs).id)
        @test isempty(p.windows) && length(p.session) == 1
    end
end

@testset "タブとコンテナ" begin
    @testset "T4 どの経路でも既定コンテナが同じに効く" begin
        p, w, a, b = sample()
        switch!(p, w, b)
        for path in OPEN_PATHS
            @test open_from!(p, w, path, "https://example.org").user_context_id == 2
        end
        @test open_from!(p, w, :urlbar, "u").workspace_id == b
        @test open_tab!(p, w, "explicit"; ctx = 0).user_context_id == 0     # 明示指定が優先
        w2 = open_window!(p; ws = b)
        @test only(w2.tabs).user_context_id == 2
        p.windows = Window[]
        @test only(open_external!(p, "https://ext.example").tabs).workspace_id == p.store.default_id
    end

    @testset "移動と改名" begin
        p, w, a, b = sample()
        t = open_tab!(p, w, "move-me")
        @test move_tab!(p, w, t.id, b)
        @test t.hidden && w.selected != t.id
        rename!(p, a, "別名")
        @test p.store.data[a].id == a && p.store.data[a].name == "別名"
    end
end

@testset "Essential とピン留め" begin
    p, w, a, b = sample()
    t = open_tab!(p, w, "mail")
    e = open_tab!(p, w, "calendar")
    pin!(w, t.id)
    make_essential!(p, w, e.id)
    @test [x.id for x in w.tabs][begin:2] == [e.id, t.id]         # Essential → ピン留め → その他
    switch!(p, w, b)
    @test !e.hidden && !t.hidden                                  # どちらも切り替えで消えない
    @test regular_count(w, a) == 2 && regular_count(w, b) == 1    # a: 通常ピン留め＋既存タブ。Essential は数えない
    @test !move_tab!(p, w, e.id, a)
    restart!(p)
    w2 = first(p.windows)
    @test any(is_essential, w2.tabs) && w2.current_ws == b
    unpin!(p, w2, only(filter(is_essential, w2.tabs)).id)
    @test !any(is_essential, w2.tabs)
end

@testset "アーカイブ" begin
    @testset "T9 削除→復元で元の ID と内容が戻る" begin
        p, w, a, b = sample()
        t = open_tab!(p, w, "keep-me")
        p.store.data[a].user_context_id = 1
        @test delete_workspace!(p, a)
        @test !haskey(p.store.data, a) && w.current_ws == p.store.default_id
        @test p.archive[end] isa ArchivedWorkspace
        id = restore!(p, w, lastindex(p.archive))
        @test id == a && p.store.data[a].user_context_id == 1
        @test any(x -> x.url == "keep-me" && x.workspace_id == a, w.tabs)
    end

    @testset "保持期間・完全削除・最後の 1 つ" begin
        p, w, a, b = sample()
        delete_workspace!(p, b)
        advance_days!(p, 29)
        @test length(p.archive) == 1
        advance_days!(p, 1)
        @test isempty(p.archive)
        @test !delete_workspace!(p, only(p.store.order))
        create_workspace!(p, "x")
        delete_workspace!(p, last(p.store.order))
        @test !purge!(p, 1) && length(p.archive) == 1             # 確認なしでは消えない
        @test purge!(p, 1; confirmed = true) && isempty(p.archive)
    end

    @testset "前回の復元が無効なら、タブは最近閉じたタブへ退避される" begin
        p, w, a, b = sample(Settings(restore_session = false))
        open_tab!(p, w, "survive")
        restart!(p)
        @test any(x -> x isa ClosedTabs, p.archive)
        @test length(p.store.order) == 2                          # 定義は残る
        restore!(p, first(p.windows), findfirst(x -> x isa ClosedTabs, p.archive))
        @test any(x -> x.url == "survive", first(p.windows).tabs)
    end
end

@testset "T6 分割表示を持つタブを別ウィンドウへ移しても維持される" begin
    p, w1, a, b = sample()
    w2 = open_window!(p)
    s1 = open_tab!(p, w1, "left"); s2 = open_tab!(p, w1, "right")
    s1.split_group = 7; s2.split_group = 7
    @test isempty(transfer_tabs!(p, w1, w2, [s1.id, s2.id]))
    @test s1.split_group == 7 && s2.split_group == 7 && s1 in w2.tabs
    @test transfer_tabs!(p, w2, w1, [s1.id]) == [7]               # 片方だけ移すと解除して通知
    @test s1.split_group === nothing && s2.split_group === nothing
    @test any(contains("split view lost"), p.log)
end
