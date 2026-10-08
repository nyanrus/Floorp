# ワークスペース中核ロジックの Julia モック（spec-next.md 準拠）
# 対象: ①ストア v4→v2 の読み込み ②タブの表示判定（Essential 含む） ③最後のタブを閉じたときの方針
# 実行: julia workspaces.jl

# ---------- 型 ----------

struct Workspace
    name::String
    user_context_id::Int            # 0 = コンテナなし
    icon::Union{String,Nothing}
end

struct Store
    schema_version::Int
    default_id::String
    data::Dict{String,Workspace}
    order::Vector{String}
end

struct Tab
    workspace_id::Union{String,Nothing}   # floorpWorkspaceId
    pinned::Bool
    essential::Bool                       # floorpEssential（pinned とセットで使う）
    selected::Bool
end

struct Settings
    exit_on_last_tab_close::Bool
    stay_on_last_tab_close::Bool          # 新設定（既定 false）
end

# 最後のタブを閉じたあとの動作
abstract type CloseAction end
struct SwitchTo     <: CloseAction; workspace_id::String end
struct KeepWithNewTab <: CloseAction end
struct CloseWindow  <: CloseAction end

# ---------- ① ストアの読み込み ----------

const UUID_RE = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"i
valid_id(s) = occursin(UUID_RE, replace(s, r"[{}]" => ""))
clean_id(s) = replace(s, r"[{}]" => "")

"""
    decode_store(raw) -> Union{Store,Nothing}

`raw` は JSON をパース済みの Dict。v4（schemaVersion なし）も v2 も読める。
壊れていれば `nothing`（呼び出し側がスナップショットから復旧する）。
"""
function decode_store(raw::AbstractDict)
    version = get(raw, "schemaVersion", 4)
    version > 2 && version != 4 && return nothing   # 未来版: 読み取り専用で扱う想定

    data = Dict{String,Workspace}()
    for (id, w) in raw["data"]                       # [[id, ws], ...] を (id, ws) で受ける
        valid_id(id) || return nothing
        data[clean_id(id)] = Workspace(
            w["name"], get(w, "userContextId", 0), get(w, "icon", nothing))
    end
    order = [clean_id(i) for i in raw["order"]]
    default_id = clean_id(raw["defaultID"])

    default_id in keys(data) || return nothing
    all(in(keys(data)), order) || return nothing
    Store(2, default_id, data, order)
end

# ---------- ② 表示判定 ----------

"Essential は pinned のうち印の付いたもの。Firefox の hideTab は pinned を拒否する。"
is_essential(t::Tab) = t.pinned && t.essential

"隠すべきか。pinned・選択中は Firefox が隠せないので常に false。"
function should_hide(t::Tab, current::String)
    (t.pinned || t.selected) && return false
    t.workspace_id !== nothing && t.workspace_id != current
end

hidden_tabs(tabs, current) = [i for (i, t) in pairs(tabs) if should_hide(t, current)]

# ---------- ③ 最後のタブを閉じたとき ----------

"そのワークスペースの、閉じるタブ以外の通常タブ数（Essential は数えない）。"
count_regular(tabs, ws) = count(t -> !is_essential(t) && t.workspace_id == ws, tabs)

function on_last_tab_closed(tabs::Vector{Tab}, current::String, s::Settings, order::Vector{String})
    count_regular(tabs, current) > 0 && return nothing     # まだ残っている

    if s.stay_on_last_tab_close
        return KeepWithNewTab()                            # 新設定: 勝手に移らない
    end

    others = [w for w in order if w != current && count_regular(tabs, w) > 0]
    isempty(others) && return s.exit_on_last_tab_close ? CloseWindow() : KeepWithNewTab()
    s.exit_on_last_tab_close && return CloseWindow()
    SwitchTo(first(others))                                # 現行の挙動
end

# ---------- テスト ----------

using Test

const A = "11111111-1111-1111-1111-111111111111"
const B = "22222222-2222-2222-2222-222222222222"

@testset "decode_store" begin
    v4 = Dict("defaultID" => "{$A}",
              "data" => [A => Dict("name" => "仕事", "userContextId" => 1),
                         B => Dict("name" => "私用")],
              "order" => [A, B])
    s = decode_store(v4)
    @test s.schema_version == 2
    @test s.data[B].user_context_id == 0            # 欠けは既定値
    @test decode_store(merge(v4, Dict("defaultID" => "x"))) === nothing
    @test decode_store(merge(v4, Dict("schemaVersion" => 9))) === nothing
end

@testset "hidden_tabs" begin
    tabs = [Tab(A, false, false, false), Tab(B, false, false, false),
            Tab(B, true, true, false),   # Essential
            Tab(B, false, false, true)]  # 選択中
    @test hidden_tabs(tabs, A) == [2]
end

@testset "on_last_tab_closed" begin
    tabs = [Tab(B, false, false, false), Tab(A, true, true, false)]
    off  = Settings(false, false)
    r = on_last_tab_closed(tabs, A, off, [A, B])                    # Essential は数えない
    @test r isa SwitchTo && r.workspace_id == B
    @test on_last_tab_closed(tabs, A, Settings(false, true), [A, B]) isa KeepWithNewTab
    @test on_last_tab_closed(tabs, A, Settings(true, false), [A, B]) isa CloseWindow
end
