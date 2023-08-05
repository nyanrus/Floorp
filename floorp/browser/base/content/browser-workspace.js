/* eslint-disable no-undef */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

//use _gBrowser instead of gBrowser when startup
const WORKSPACE_TAB_ENABLED_PREF = "floorp.browser.workspace.tab.enabled";
const WORKSPACE_CURRENT_PREF = "floorp.browser.workspace.current";
const WORKSPACE_ALL_PREF = "floorp.browser.workspace.all";
const WORKSPACE_TABS_PREF = "floorp.browser.workspace.tabs.state";
const WORKSPACE_MANAGE_ON_BMS_PREF = "floorp.browser.workspace.manageOnBMS";
const WORKSPACE_CLOSE_POPUP_AFTER_CLICK_PREF =
  "floorp.browser.workspace.closePopupAfterClick";
const WORKSPACE_EXCLUDED_PINNED_TABS_PREF =
  "floorp.browser.workspace.excludePinnedTabs";
const WORKSPACE_INFO_PREF = "floorp.browser.workspace.info";
const l10n = new Localization(["browser/floorp.ftl"], true);
const defaultWorkspaceName = Services.prefs
  .getStringPref(WORKSPACE_ALL_PREF)
  .split(",")[0];

const CONTAINER_ICONS = new Set([
  "briefcase",
  "cart",
  "circle",
  "dollar",
  "fence",
  "fingerprint",
  "gift",
  "vacation",
  "food",
  "fruit",
  "pet",
  "tree",
  "chill",
]);

const workspaceFunctions = {
  eventListeners: {
    tabAddEventListeners: {
      handleTabOpen() {
        let tabs = gBrowser.tabs;
        let lastTab = null;
        let firstTab = null;
        document
          .querySelector(`[floorp-lastVisibleTab]`)
          ?.removeAttribute("floorp-lastVisibleTab");
        document
          .querySelector(`[floorp-firstVisibleTab]`)
          ?.removeAttribute("floorp-firstVisibleTab");
        for (let i = 0; i < tabs.length; i++) {
          let tab = tabs[i];
          if (!tab.hasAttribute("floorp-workspace")) {
            tab.setAttribute(
              "floorp-workspace",
              Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF)
            );
          }
          if (
            tab.getAttribute("floorp-workspace") ==
            Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF)
          ) {
            lastTab = tab;
          }
          if (
            tab.getAttribute("floorp-workspace") ==
              Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF) &&
            firstTab == null
          ) {
            tab.setAttribute("floorp-firstVisibleTab", "true");
            firstTab = tab;
          }
        }
        lastTab?.setAttribute("floorp-lastVisibleTab", "true");
        workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();
      },

      handleTabClose() {
        window.setTimeout(() => {
          document
            .querySelector(`[floorp-firstVisibleTab]`)
            ?.removeAttribute("floorp-firstVisibleTab");
          document
            .querySelector(`[floorp-lastVisibleTab]`)
            ?.removeAttribute("floorp-lastVisibleTab");
          document
            .querySelector(`tab:not([hidden])`)
            .setAttribute("floorp-firstVisibleTab", "true");
          let elems = document.querySelectorAll(`tab:not([hidden])`);
          elems[elems.length - 1].setAttribute("floorp-lastVisibleTab", "true");
          workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();

          let currentWorkspace = Services.prefs.getStringPref(
            WORKSPACE_CURRENT_PREF
          );
          let count =
            workspaceFunctions.manageWorkspaceFunctions.checkWorkspaceTabLength(
              currentWorkspace
            );
          if (count == 0) {
            workspaceFunctions.manageWorkspaceFunctions.deleteworkspace(
              currentWorkspace
            );
            workspaceFunctions.manageWorkspaceFunctions.changeWorkspaceToBeforeNext();
          }
        }, 400);
      },

      handleTabObeserver() {
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
      },
      
      handleTabSelect() {
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
        workspaceFunctions.tabFunctions.addLastShowedWorkspaceTab();        
      },

      handleTabMove() {
        workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();
        document
          .querySelector(`[floorp-firstVisibleTab]`)
          ?.removeAttribute("floorp-firstVisibleTab");
        document
          .querySelector(`[floorp-lastVisibleTab]`)
          ?.removeAttribute("floorp-lastVisibleTab");
        document
          .querySelector(`tab:not([hidden])`)
          .setAttribute("floorp-firstVisibleTab", "true");
        let elems = document.querySelectorAll(`tab:not([hidden])`);
        elems[elems.length - 1].setAttribute("floorp-lastVisibleTab", "true");
      },
    },

    prefsEventListeners: {
      handleWorkspacePrefChange() {
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
        workspaceFunctions.WorkspaceContextMenu.setMenuItemCheckCSS();
      },

      handleWorkspaceTabPrefChange() {
        document.querySelector("#workspace-button").style.display =
          Services.prefs.getBoolPref(WORKSPACE_TAB_ENABLED_PREF) ? "" : "none";
        if (!Services.prefs.getBoolPref(WORKSPACE_TAB_ENABLED_PREF)) {
          document
            .querySelector(`[floorp-firstVisibleTab]`)
            ?.removeAttribute("floorp-firstVisibleTab");
          document
            .querySelector(`[floorp-lastVisibleTab]`)
            ?.removeAttribute("floorp-lastVisibleTab");
        }
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
      },

      handleWorkspaceManageOnBMSPrefChange() {
        /*
        const manageOnBMS = Services.prefs.getBoolPref(
          WORKSPACE_MANAGE_ON_BMS_PREF
        );

        if (manageOnBMS) {
          workspaceFunctions.bmsWorkspaceFunctions.moveWorkspaceManagerToBMS();
        } else {
          // Currently not working
          workspaceFunctions.bmsWorkspaceFunctions.moveWorkspaceManagerToDefault();
        }
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();

        */
      },
    },

    keyboradEventListeners: {
      handle_keydown(event) {
        if (event.shiftKey && event.key === "ArrowUp") {
          workspaceFunctions.manageWorkspaceFunctions.changeWorkspaceToBeforeNext();
        } else if (event.shiftKey && event.key === "ArrowDown") {
          workspaceFunctions.manageWorkspaceFunctions.changeWorkspaceToAfterNext();
        }
      },
    },
  },
  manageWorkspaceFunctions: {
    initWorkspace() {
      // First run
      if (!Services.prefs.prefHasUserValue(WORKSPACE_CURRENT_PREF)) {
        Services.prefs.setStringPref(
          WORKSPACE_CURRENT_PREF,
          l10n.formatValueSync("workspace-default")
        );
        Services.prefs.setStringPref(
          WORKSPACE_ALL_PREF,
          l10n.formatValueSync("workspace-default")
        );
      }

      let tabs = gBrowser.tabs;

      if (Services.prefs.getStringPref(WORKSPACE_TABS_PREF) === "[]") {
        for (let i = 0; i < tabs.length; i++) {
          tabs[i].setAttribute(
            "floorp-workspace",
            Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF)
          );
        }
      } else {
        let tabsStates = JSON.parse(
          Services.prefs.getStringPref(WORKSPACE_TABS_PREF)
        );

        for (let i = 0; i < tabs.length; i++) {
          let tab = tabs[i];
          let state =
            tabsStates[i] && tabsStates[i][i] && tabsStates[i][i].workspace;

          if (state !== undefined && state !== null && state !== "") {
            tab.setAttribute("floorp-workspace", state);
          } else {
            tab.setAttribute(
              "floorp-workspace",
              Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF)
            );
          }
        }
      }

      const toolbarButtonEle = window.MozXULElement.parseXULToFragment(`
        <toolbarbutton id="workspace-button"
                        class="toolbarbutton-1 chromeclass-toolbar-additional"
                        label="Workspace"
                        tooltiptext="Workspace"
                        type="menu"
                        style="list-style-image: url('chrome://browser/skin/workspace-floorp.png');">
          <menupopup id="workspace-menu" context="workspace-menu-context">
            <toolbarbutton style="list-style-image: url('chrome://global/skin/icons/plus.svg');"
                    id="addNewWorkspaceButton"        data-l10n-id="workspace-add" class="subviewbutton subviewbutton-nav" oncommand="workspaceFunctions.manageWorkspaceFunctions.addNewWorkspace();"/>
          </menupopup>
        </toolbarbutton>
      `);

      document.querySelector(".toolbar-items").before(toolbarButtonEle);
      if (!Services.prefs.getBoolPref(WORKSPACE_TAB_ENABLED_PREF)) {
        document.querySelector("#workspace-button").style.display = "none";
      }

      // Add workspace menu
      let workspaceAll = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      for (let i = 0; i < workspaceAll.length; i++) {
        let label = workspaceAll[i];
        workspaceFunctions.WorkspaceContextMenu.addWorkspaceElemToMenu(label);
      }

      // Add attribute to tab
      workspaceFunctions.tabFunctions.addLastShowedWorkspaceTab();
      workspaceFunctions.TabContextMenu.addContextMenuToTabContext();
      workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();
      workspaceFunctions.WorkspaceContextMenu.setMenuItemCheckCSS();
    },

    addNewWorkspace() {
      let allWorkspace = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      let l10n = new Localization(["browser/floorp.ftl"], true);
      let prompts = Services.prompt;
      let check = { value: false };
      let pattern = /^[\p{L}\p{N}]+$/u;
      let input = { value: "" };
      let result = prompts.prompt(
        null,
        l10n.formatValueSync("workspace-prompt-title"),
        l10n.formatValueSync("please-enter-workspace-name") +
          "\n" +
          l10n.formatValueSync("please-enter-workspace-name-2"),
        input,
        null,
        check
      );

      if (
        result &&
        allWorkspace.includes(input.value) == -1 &&
        input.value != "" &&
        input.value.length < 20 &&
        input.value != l10n.formatValueSync("workspace-default") &&
        pattern.test(input.value)
      ) {
        let label = input.value;
        let workspaceAll = Services.prefs
          .getStringPref(WORKSPACE_ALL_PREF)
          .split(",");
        try {
          workspaceFunctions.WorkspaceContextMenu.addWorkspaceElemToMenu(label);
        } catch (e) {
          prompts.alert(
            null,
            l10n.formatValueSync("workspace-prompt-title"),
            l10n.formatValueSync("workspace-error") +
              "\n" +
              l10n.formatValueSync("workspace-error-discription")
          );
        }
        workspaceAll.push(label);
        Services.prefs.setStringPref(WORKSPACE_ALL_PREF, workspaceAll);
      } else if (result === false) {
        /* empty */
      } else {
        prompts.alert(
          null,
          l10n.formatValueSync("workspace-prompt-title"),
          l10n.formatValueSync("workspace-error") +
            "\n" +
            l10n.formatValueSync("workspace-error-discription")
        );
      }
    },

    deleteworkspace(workspace) {
      if (workspace !== defaultWorkspaceName) {
        let allWorkspaces = Services.prefs
          .getCharPref(WORKSPACE_ALL_PREF)
          .split(",");
        let index = allWorkspaces.indexOf(workspace);
        let currentWorkspace = Services.prefs.getStringPref(
          WORKSPACE_CURRENT_PREF
        );

        //move to other workspace
        if (currentWorkspace == workspace) {
          workspaceFunctions.manageWorkspaceFunctions.changeWorkspace(
            allWorkspaces[0]
          );
          Services.prefs.setStringPref(
            WORKSPACE_CURRENT_PREF,
            defaultWorkspaceName
          );
          workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
        }
        allWorkspaces.splice(index, 1);
        Services.prefs.setCharPref(WORKSPACE_ALL_PREF, allWorkspaces.join(","));

        //delete workspace tabs
        let tabs = gBrowser.tabs;
        for (let i = 0; i < tabs.length; i++) {
          let tab = tabs[i];
          let tabWorkspace = tab.getAttribute("floorp-workspace");
          if (tabWorkspace == workspace) {
            gBrowser.removeTab(tab);
          }
        }
        //delete workspace menuitem
        let menuitem = document.getElementById(`workspace-box-${workspace}`);
        menuitem.remove();

        //rebuild workspace menu
        workspaceFunctions.manageWorkspaceFunctions.rebuildWorkspaceMenu();
      }
    },

    renameWorkspace(label) {
      label = label.replace(/\s+/g, "-");
      let prompts = Services.prompt;
      let l10n = new Localization(["browser/floorp.ftl"], true);
      let check = { value: false };
      let pattern = /^[\p{L}\p{N}\s]+$/u;
      let input = { value: "" };
      let result = prompts.prompt(
        null,
        l10n.formatValueSync("workspace-prompt-title"),
        l10n.formatValueSync("please-enter-workspace-name") +
          "\n" +
          l10n.formatValueSync("please-enter-workspace-name-2"),
        input,
        null,
        check
      );

      if (
        result &&
        input.value != "" &&
        input.value.length < 20 &&
        input.value != l10n.formatValueSync("workspace-default") &&
        pattern.test(input.value)
      ) {
        input.value = input.value.replace(/\s+/g, "-");
        let workspaceAll = Services.prefs
          .getStringPref(WORKSPACE_ALL_PREF)
          .split(",");
        let index = workspaceAll.indexOf(label);
        workspaceAll[index] = input.value;
        Services.prefs.setStringPref(WORKSPACE_ALL_PREF, workspaceAll);

        //Tabs
        let tabs = gBrowser.tabs;
        for (let i = 0; i < tabs.length; i++) {
          let tab = tabs[i];
          if (tab.getAttribute("floorp-workspace") == label) {
            tab.setAttribute("floorp-workspace", input.value);
          }
        }
        workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();

        //lastShowWorkspaceTab
        document
          .querySelector(`[lastShowWorkspaceTab-${label}]`)
          ?.setAttribute(`lastShowWorkspaceTab-${input.value}`, "true");

        //menuitem
        let menuitem = document.querySelector(`#workspace-box-${label}`);
        let nextAfterMenuitem = menuitem.nextSibling;

        menuitem.remove();
        workspaceFunctions.WorkspaceContextMenu.addWorkspaceElemToMenu(
          input.value,
          nextAfterMenuitem
        );

        let currentWorkspace = Services.prefs.getStringPref(
          WORKSPACE_CURRENT_PREF
        );

        if (currentWorkspace == label) {
          Services.prefs.setStringPref(WORKSPACE_CURRENT_PREF, input.value);
        }
      } else if (result === false) {
        /* empty */
      } else {
        prompts.alert(
          null,
          l10n.formatValueSync("workspace-prompt-title"),
          l10n.formatValueSync("workspace-error") +
            "\n" +
            l10n.formatValueSync("workspace-error-discription")
        );
      }

      //add icon to workspace
      const oldIcon = workspaceFunctions.iconFunctions.getWorkspaceIcon(label);
      workspaceFunctions.manageWorkspaceFunctions.addIconToWorkspace(
        input.value,
        oldIcon
      );
      workspaceFunctions.iconFunctions.deleteIcon(label);

      //rebuild workspace menu
      workspaceFunctions.manageWorkspaceFunctions.rebuildWorkspaceMenu();
    },

    // eslint-disable-next-line no-dupe-keys
    addNewWorkspace() {
      let allWorkspace = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      let l10n = new Localization(["browser/floorp.ftl"], true);
      prompts = Services.prompt;
      let check = { value: false };
      const pattern = /^[\p{L}\p{N}\s]+$/u;
      let input = { value: "" };
      let result = prompts.prompt(
        null,
        l10n.formatValueSync("workspace-prompt-title"),
        l10n.formatValueSync("please-enter-workspace-name") +
          "\n" +
          l10n.formatValueSync("please-enter-workspace-name-2"),
        input,
        null,
        check
      );

      if (
        result &&
        !allWorkspace.includes(input.value) &&
        input.value != "" &&
        input.value.length < 20 &&
        input.value != l10n.formatValueSync("workspace-default") &&
        pattern.test(input.value)
      ) {
        let label = input.value;
        label = label.replace(/\s+/g, "-");

        let workspaceAll = Services.prefs
          .getStringPref(WORKSPACE_ALL_PREF)
          .split(",");
        try {
          workspaceFunctions.WorkspaceContextMenu.addWorkspaceElemToMenu(label);
        } catch (e) {
          prompts.alert(
            null,
            l10n.formatValueSync("workspace-prompt-title"),
            l10n.formatValueSync("workspace-error") +
              "\n" +
              l10n.formatValueSync("workspace-error-discription")
          );
          return;
        }
        workspaceAll.push(label);
        Services.prefs.setStringPref(WORKSPACE_ALL_PREF, workspaceAll);
      } else if (result === false) {
        /* empty */
      } else {
        prompts.alert(
          null,
          l10n.formatValueSync("workspace-prompt-title"),
          l10n.formatValueSync("workspace-error") +
            "\n" +
            l10n.formatValueSync("workspace-error-discription")
        );
      }

      //rebuild workspace menu
      workspaceFunctions.manageWorkspaceFunctions.rebuildWorkspaceMenu();
    },

    setCurrentWorkspace() {
      let tabs = gBrowser.tabs;
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );

      document
        .querySelector(`[floorp-lastVisibleTab]`)
        ?.removeAttribute("floorp-lastVisibleTab");
      document
        .querySelector(`[floorp-firstVisibleTab]`)
        ?.removeAttribute("floorp-firstVisibleTab");
      let lastTab = null;
      let firstTab = null;
      const excludePinnedTabs = Services.prefs.getBoolPref(
        WORKSPACE_EXCLUDED_PINNED_TABS_PREF
      );
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        let workspace = tab.getAttribute("floorp-workspace");
        if (
          workspace == currentWorkspace ||
          !Services.prefs.getBoolPref(WORKSPACE_TAB_ENABLED_PREF)
        ) {
          gBrowser.showTab(tab);
          tab.removeAttribute("hidden");
          lastTab = tab;
          if (firstTab == null) {
            tab.setAttribute("floorp-firstVisibleTab", "true");
            firstTab = tab;
          }
        } else {
          gBrowser.hideTab(tab);

          if (!excludePinnedTabs) {
            tab.setAttribute("hidden", "true");
          }
        }

        if (currentWorkspace != l10n.formatValueSync("workspace-default")) {
          document
            .getElementById("workspace-button")
            .setAttribute("label", currentWorkspace.replace(/-/g, " "));
          document.querySelector(
            "#workspace-button > .toolbarbutton-text"
          ).style.display = "inherit";
        } else {
          document.getElementById("workspace-button").removeAttribute("label");
          document.querySelector(
            "#workspace-button > .toolbarbutton-text"
          ).style.display = "none";
        }
      }
      lastTab?.setAttribute("floorp-lastVisibleTab", "true");

      //set workspaces icon
      const iconURL =
        workspaceFunctions.iconFunctions.getWorkspaceIcon(currentWorkspace);
      document.getElementById(
        "workspace-button"
      ).style.listStyleImage = `url(${iconURL})`;
    },

    saveWorkspaceState() {
      let tabs = gBrowser.tabs;
      let tabStateObject = [];

      // delete unmatched tabs
      const allWorkspaces = Services.prefs.getStringPref(WORKSPACE_ALL_PREF);
      const allWorkspacesArray = allWorkspaces.split(",");

      //get all workspace tabs Workspace
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        let tabWorkspace = tab.getAttribute("floorp-workspace");
        if (!allWorkspacesArray.includes(tabWorkspace)) {
          tab.setAttribute(
            "floorp-workspace",
            Services.prefs.getStringPref(WORKSPACE_CURRENT_PREF)
          );
          console.warn("Move default. unmatched tabs found");
        }
      }

      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        let tabState = {
          [i]: {
            workspace: tab.getAttribute("floorp-workspace"),
          },
        };
        tabStateObject.push(tabState);
      }
      Services.prefs.setStringPref(
        WORKSPACE_TABS_PREF,
        JSON.stringify(tabStateObject)
      );
    },

    changeWorkspaceToAfterNext() {
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );
      let workspaceAll = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      let index = workspaceAll.indexOf(currentWorkspace);
      if (index == workspaceAll.length - 1) {
        return;
      }
      let afterWorkspace = workspaceAll[index + 1];
      workspaceFunctions.manageWorkspaceFunctions.changeWorkspace(
        afterWorkspace
      );
      workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
    },

    changeWorkspaceToNext() {
      let allWorkspaces = Services.prefs
        .getCharPref(WORKSPACE_ALL_PREF)
        .split(",");
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );
      let index = allWorkspaces.indexOf(currentWorkspace);
      let nextWorkspace = allWorkspaces[index + 1] ?? allWorkspaces[0];
      workspaceFunctions.manageWorkspaceFunctions.changeWorkspace(
        nextWorkspace
      );
    },

    changeWorkspaceToBeforeNext() {
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );
      let workspaceAll = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      let index = workspaceAll.indexOf(currentWorkspace);
      if (index == 0) {
        return;
      }
      let beforeWorkspace = workspaceAll[index - 1];

      workspaceFunctions.manageWorkspaceFunctions.changeWorkspace(
        beforeWorkspace
      );
      workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
    },

    changeWorkspace(label) {
      let tabs = gBrowser.tabs;

      Services.prefs.setStringPref(WORKSPACE_CURRENT_PREF, label);
      if (
        !workspaceFunctions.tabFunctions.checkWorkspaceLastShowedTabAttributeExist(
          label
        )
      ) {
        document
          .querySelector(`[floorp-workspace="${label}"]`)
          ?.setAttribute(`lastShowWorkspaceTab-${label}`, "true");
      }
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        if (tab.getAttribute(`lastShowWorkspaceTab-${label}`) == "true") {
          gBrowser.selectedTab = tab;
          break;
        } else if (i == tabs.length - 1) {
          let newtabURL = Services.prefs.getStringPref(
            "browser.startup.homepage"
          );
          gBrowser.addTab(newtabURL, {
            skipAnimation: true,
            inBackground: false,
            triggeringPrincipal:
              Services.scriptSecurityManager.getSystemPrincipal(),
          });
        }
      }
      workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
      workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();

      const closeWorkspacePopupAfterClick = Services.prefs.getBoolPref(
        WORKSPACE_CLOSE_POPUP_AFTER_CLICK_PREF
      );
      if (closeWorkspacePopupAfterClick) {
        document.getElementById("workspace-button").click();
      }
    },

    checkWorkspaceTabLength(name) {
      const data = JSON.parse(
        Services.prefs.getStringPref(WORKSPACE_TABS_PREF)
      );
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        const obj = data[i];
        const keys = Object.keys(obj);
        const workspaceValue = obj[keys[0]].workspace;

        if (workspaceValue == name) {
          count++;
        }
      }
      return count;
    },

    checkWorkspaceInfoExist(name) {
      const data = JSON.parse(
        Services.prefs.getStringPref(WORKSPACE_INFO_PREF)
      );
      for (let i = 0; i < data.length; i++) {
        const obj = data[i];
        const keys = Object.keys(obj);
        const workspaceValue = keys[0];

        if (workspaceValue == name) {
          // return workspaceValue;
          return i;
        }
      }
      return false;
    },

    rebuildWorkspaceMenu() {
      const allWorkspace = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      const workspaceMenu = document.getElementById("workspace-menu");

      while (workspaceMenu.firstChild) {
        if (workspaceMenu.firstChild.id == "addNewWorkspaceButton") {
          break;
        }
        workspaceMenu.firstChild.remove();
      }

      for (let i = 0; i < allWorkspace.length; i++) {
        let label = allWorkspace[i];
        workspaceFunctions.WorkspaceContextMenu.addWorkspaceElemToMenu(label);
      }

      //set workspaces icon
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );
      const iconURL =
        workspaceFunctions.iconFunctions.getWorkspaceIcon(currentWorkspace);
      document.getElementById(
        "workspace-button"
      ).style.listStyleImage = `url(${iconURL})`;
    },

    addIconToWorkspace(workspaceName, iconName) {
      if (workspaceName.wrappedJSObject) {
        iconName = workspaceName.wrappedJSObject.icon;
        workspaceName = workspaceName.wrappedJSObject.name;
      }

      let settings = JSON.parse(
        Services.prefs.getStringPref(WORKSPACE_INFO_PREF)
      );

      const targetWorkspaceNumber =
        workspaceFunctions.manageWorkspaceFunctions.checkWorkspaceInfoExist(
          workspaceName
        );

      let iconURL = "";

      if (
        iconName.startsWith("resource://") ||
        iconName.startsWith("chrome://") ||
        iconName.startsWith("file://") ||
        iconName.startsWith("data:") ||
        iconName.startsWith("http://") ||
        iconName.startsWith("https://")
      ) {
        iconURL = iconName;
      } else {
        iconURL = workspaceFunctions.iconFunctions.getIcon(iconName);
      }

      if (targetWorkspaceNumber === false) {
        settingObject = {
          [workspaceName]: {
            icon: iconURL,
          },
        };
        settings.push(settingObject);
      } else {
        settings[targetWorkspaceNumber][workspaceName].icon = iconURL;
      }

      Services.prefs.setStringPref(
        WORKSPACE_INFO_PREF,
        JSON.stringify(settings)
      );

      //rebuild workspace menu
      workspaceFunctions.manageWorkspaceFunctions.rebuildWorkspaceMenu();
    },
  },

  iconFunctions: {
    getIcon(iconName) {
      if (!CONTAINER_ICONS.has(iconName)) {
        throw console.error(`Invalid icon ${iconName} for workspace`);
      }
      return `chrome://browser/skin/workspace-icons/${iconName}.svg`;
    },

    getWorkspaceIcon(workspaceName) {
      const settings = JSON.parse(
        Services.prefs.getStringPref(WORKSPACE_INFO_PREF)
      );
      const targetWorkspaceNumber =
        workspaceFunctions.manageWorkspaceFunctions.checkWorkspaceInfoExist(
          workspaceName
        );
      if (
        targetWorkspaceNumber === false ||
        settings[targetWorkspaceNumber][workspaceName].icon == "" ||
        settings[targetWorkspaceNumber][workspaceName].icon == undefined
      ) {
        return "chrome://browser/skin/workspace-floorp.png";
      }
      return settings[targetWorkspaceNumber][workspaceName].icon;
    },

    deleteIcon(workspaceName) {
      const settings = JSON.parse(
        Services.prefs.getStringPref(WORKSPACE_INFO_PREF)
      );
      const targetWorkspaceNumber =
        workspaceFunctions.manageWorkspaceFunctions.checkWorkspaceInfoExist(
          workspaceName
        );
      if (targetWorkspaceNumber === false) {
        return;
      }
      delete settings[targetWorkspaceNumber][workspaceName].icon;
      Services.prefs.setStringPref(
        WORKSPACE_INFO_PREF,
        JSON.stringify(settings)
      );
    },

    setWorkspaceFromPrompt(label) {
      let parentWindow = Services.wm.getMostRecentWindow("navigator:browser");
      let object = { workspaceName: label };
      if (
        parentWindow?.document.documentURI ==
        "chrome://browser/content/hiddenWindowMac.xhtml"
      ) {
        parentWindow = null;
      }
      if (parentWindow?.gDialogBox) {
        parentWindow.gDialogBox.open(
          "chrome://browser/content/preferences/dialogs/manageWorkspace.xhtml",
          object
        );
      } else {
        Services.ww.openWindow(
          parentWindow,
          "chrome://browser/content/preferences/dialogs/manageWorkspace.xhtml",
          null,
          "chrome,titlebar,dialog,centerscreen,modal",
          object
        );
      }
    },
  },

  tabFunctions: {
    moveTabToOtherWorkspace(tab, workspace) {
      //checkTabisCurrentTab
      if (
        tab == gBrowser.selectedTab &&
        workspaceFunctions.tabFunctions.getNextToWorkspaceTab() != null
      ) {
        gBrowser.selectedTab =
          workspaceFunctions.tabFunctions.getNextToWorkspaceTab();
      }

      let willMoveWorkspace = workspace;
      tab.setAttribute("floorp-workspace", willMoveWorkspace);

      workspaceFunctions.manageWorkspaceFunctions.saveWorkspaceState();
      workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace();
    },

    addLastShowedWorkspaceTab() {
      //add lastShowWorkspaceTab
      let currentTab = gBrowser.selectedTab;
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );

      document
        .querySelector(`[lastShowWorkspaceTab-${currentWorkspace}]`)
        ?.removeAttribute(`lastShowWorkspaceTab-${currentWorkspace}`);
      currentTab.setAttribute(
        `lastShowWorkspaceTab-${currentWorkspace}`,
        "true"
      );
    },

    checkTabsLength() {
      let tabs = gBrowser.tabs;
      for (let i = 0; i < tabs.length; i++) {
        if (
          TabContextMenu.contextTab.getAttribute("firstVisibleTab") == "true"
        ) {
          document
            .getElementById("context_MoveOtherWorkspace")
            .setAttribute("disabled", "true");
        }
      }
    },

    getNextToWorkspaceTab() {
      let tabs = gBrowser.tabs;
      let nextTab = null;
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        if (
          tab.getAttribute("floorp-workspace") ==
            gBrowser.selectedTab.getAttribute("floorp-workspace") &&
          tab != gBrowser.selectedTab
        ) {
          nextTab = tab;
          break;
        }
      }
      return nextTab;
    },

    checkWorkspaceLastShowedTabAttributeExist(label) {
      let tabs = gBrowser.tabs;
      let exist = false;
      for (let i = 0; i < tabs.length; i++) {
        let tab = tabs[i];
        if (tab.getAttribute(`lastShowWorkspaceTab-${label}`) == "true") {
          exist = true;
          break;
        }
      }
      return exist;
    },
  },

  TabContextMenu: {
    addContextMenuToTabContext() {
      let beforeElem = document.getElementById("context_moveTabOptions");
      let menuitemElem = window.MozXULElement.parseXULToFragment(`
      <menu id="context_MoveOtherWorkspace" data-l10n-id="move-tab-another-workspace" accesskey="D">
          <menupopup id="workspaceTabContextMenu"
                     onpopupshowing="workspaceFunctions.TabContextMenu.CreateWorkspaceContextMenu();"/>
      </menu>
      `);
      beforeElem.before(menuitemElem);
    },

    CreateWorkspaceContextMenu() {
      //delete already exsist items
      let menuElem = document.getElementById("workspaceTabContextMenu");
      while (menuElem.firstChild) {
        menuElem.firstChild.remove();
      }

      //Rebuild context menu
      if (workspaceFunctions.tabFunctions.getNextToWorkspaceTab() == null) {
        let menuItem = window.MozXULElement.parseXULToFragment(`
         <menuitem data-l10n-id="workspace-context-menu-selected-tab" disabled="true"/>
        `);
        let parentElem = document.getElementById("workspaceTabContextMenu");
        parentElem.appendChild(menuItem);
        return;
      }

      let workspaceAll = Services.prefs
        .getStringPref(WORKSPACE_ALL_PREF)
        .split(",");
      for (let i = 0; i < workspaceAll.length; i++) {
        let workspace = workspaceAll[i];
        let menuItem = window.MozXULElement.parseXULToFragment(`
          <menuitem id="workspaceID-${workspace}" class="workspaceContextMenuItems"
                    label="${workspace.replace(
                      /-/g,
                      " "
                    )}"  oncommand="workspaceFunctions.tabFunctions.moveTabToOtherWorkspace(TabContextMenu.contextTab, '${workspace}');"/>
        `);
        let parentElem = document.getElementById("workspaceTabContextMenu");
        if (
          workspace !=
          TabContextMenu.contextTab.getAttribute("floorp-workspace")
        ) {
          parentElem.appendChild(menuItem);
        }
      }
    },
  },

  WorkspaceContextMenu: {
    addWorkspaceElemToMenu(label, nextElem) {
      let labelDisplay = label.replace(/-/g, " ");
      let workspaceItemElem = window.MozXULElement.parseXULToFragment(`

      <vbox id="workspace-box-${label}" class="workspace-label-box">
       <hbox id="workspace-${label}" class="workspace-item-box">
         <toolbarbutton id="workspace-label" label="${labelDisplay}"
                   class="toolbarbutton-1 workspace-item" workspace="${label}"
                   context="workspace-item-context" oncommand="workspaceFunctions.manageWorkspaceFunctions.changeWorkspace('${label}')"/>
         <toolbarbutton workspace="${labelDisplay}" iconName="${label}"  context="workspace-icon-context" id="workspace-icon" class="workspace-item-icon toolbarbutton-1" oncommand="workspaceFunctions.manageWorkspaceFunctions.changeWorkspace('${label}')" style="list-style-image: url(${workspaceFunctions.iconFunctions.getWorkspaceIcon(
        label
      )})"/>
       </hbox>
       <menuseparator class="workspace-item-separator"/>
      </vbox>
    `);

      if (nextElem) {
        nextElem.before(workspaceItemElem);
      } else {
        document
          .getElementById("addNewWorkspaceButton")
          .before(workspaceItemElem);
      }

      if (
        Services.prefs.getStringPref(WORKSPACE_ALL_PREF).split(",")[0] !== label
      ) {
        let deleteButtonElem = window.MozXULElement.parseXULToFragment(`
            <toolbarbutton id="workspace-delete" class="workspace-item-delete toolbarbutton-1"
                           oncommand="workspaceFunctions.manageWorkspaceFunctions.deleteworkspace('${label}')"/>
        `);
        document
          .getElementById(`workspace-${label}`)
          .appendChild(deleteButtonElem);
      }
    },

    createWorkspacemenuItemContext(e) {
      let oldMenuItems = document.querySelectorAll(".workspace-item-contexts");

      for (let i = 0; i < oldMenuItems.length; i++) {
        oldMenuItems[i].remove();
      }

      let menuitemElem = window.MozXULElement.parseXULToFragment(`
        <menuitem class="workspace-item-contexts" id="workspace-item-context-rename" data-l10n-id="workspace-rename" oncommand="workspaceFunctions.manageWorkspaceFunctions.renameWorkspace('${e.explicitOriginalTarget.getAttribute(
          "label"
        )}')"/>
      `);

      document
        .getElementById("workspace-item-context")
        .appendChild(menuitemElem);
    },

    createWorkspaceIconContext(e) {
      let oldMenuItems = document.querySelectorAll(".workspace-icon-context");

      for (let i = 0; i < oldMenuItems.length; i++) {
        oldMenuItems[i].remove();
      }

      let menuitemElem = window.MozXULElement.parseXULToFragment(`
      <menuitem class="workspace-icon-context" id="workspace-item-context-icon-delete" data-l10n-id="workspace-delete" 
                oncommand="workspaceFunctions.manageWorkspaceFunctions.deleteworkspace('${e.explicitOriginalTarget.getAttribute(
                  "workspace"
                )}');"/>
      <menuitem class="workspace-icon-context" id="workspace-item-context-icon-rename" data-l10n-id="workspace-rename" 
                oncommand="workspaceFunctions.manageWorkspaceFunctions.renameWorkspace('${e.explicitOriginalTarget.getAttribute(
                  "workspace"
                )}')"/>
      <menuitem class="workspace-icon-context" id="workspace-item-context-icon-change-icon" data-l10n-id="workspace-select-icon"
                oncommand="workspaceFunctions.iconFunctions.setWorkspaceFromPrompt('${e.explicitOriginalTarget.getAttribute(
                  "workspace"
                )}')"/>
 
     `);

      if (
        e.explicitOriginalTarget.getAttribute("workspace") ==
        defaultWorkspaceName
      ) {
        menuitemElem.firstChild.remove();
      }

      document
        .getElementById("workspace-icon-context")
        .appendChild(menuitemElem);
    },

    setMenuItemCheckCSS() {
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );
      document.getElementById("workspaceMenuItemCheckCSS")?.remove();

      let Tag = document.createElement("style");
      Tag.innerText = `
        .workspace-item[workspace="${currentWorkspace}"] > .toolbarbutton-icon {
          visibility: inherit !important;
        }
        .workspace-item-icon[workspace="${currentWorkspace.replace(
          /-/g,
          " "
        )}"] {
          border-radius: 2px;
          box-shadow: 0 0 0 1px var(--lwt-accent-color) !important;
          background-color: var(--lwt-accent-color) !important;
        }
      `;
      Tag.setAttribute("id", "workspaceMenuItemCheckCSS");
      document.head.appendChild(Tag);
    },
  },

  bmsWorkspaceFunctions: {
    moveWorkspaceManagerToBMS() {
      const moveTargetElemID = "workspace-menu";
      const movedAfterElem = document.getElementById("panelBox");

      movedAfterElem.before(document.getElementById(moveTargetElemID));
      workspaceFunctions.bmsWorkspaceFunctions.changeElementTag(
        moveTargetElemID,
        "vbox"
      );

      const styleElem = document.createElement("style");
      const modifyCSS = `
      #workspace-label {
        display: none !important;
      }
      #workspace-delete {
        display: none !important;
      }
      .workspace-item-separator {
        display: none !important;
      }
      #addNewWorkspaceButton > .toolbarbutton-text {
        display: none !important;
      }
      #workspace-menu {
        margin: 0 !important;
      }
      .workspace-item-box {
        margin: 0 !important;
      }
      .workspace-item-icon {
        appearance: none;
        -moz-context-properties: fill, fill-opacity;
        border-radius: 4px;
        color: inherit;
        fill: currentColor;
        margin: 1px 2px 5px 5px;
        padding: 7px;
        scale: 1.0;
      }

      #addNewWorkspaceButton {
        appearance: none;
        -moz-context-properties: fill, fill-opacity;
        border-radius: 4px;
        color: inherit;
        fill: currentColor;
        margin: 1px 2px 5px 4px;
        padding: 9px;
        scale: 1.0;
        width: 33px !important;
        height: 31px !important;
      }

      #addNewWorkspaceButton > .toolbarbutton-icon {
        scale: 1.2;
      }

      #workspace-icon > .toolbarbutton-icon {
        scale: 1.3;
      }

      @media not (prefers-contrast) {
        .workspace-item-icon:hover {
          box-shadow: 0 0 4px rgba(0,0,0,.4) ;
          background-color: var(--tab-selected-bgcolor, var(--toolbar-bgcolor));
        }
        .workspace-item-icon[checked="true"]{
        background-color: color-mix(in srgb, currentColor 20%, transparent) ;
        box-shadow: 0 0 4px rgba(0,0,0,.4) ;
        }
        .workspace-item-icon:not([checked="true"]):active, .workspace-item-icon:active {
          background-color: color-mix(in srgb, currentColor 20%, transparent);
          box-shadow: 0 0 4px rgba(0,0,0,.4);
        }
      }
      
      @media (prefers-contrast) {
        .workspace-item-icon:hover {
          outline: 1px solid currentColor;
        }
      }
      `;
      styleElem.innerText = modifyCSS;
      styleElem.id = "workspaceManagerBMSStyle";
      document.head.appendChild(styleElem);

      const spacer = window.MozXULElement.parseXULToFragment(`
        <spacer flex="1" id="workspace-spacer"/>
      `);

      document.getElementById(moveTargetElemID).after(spacer);
    },

    moveWorkspaceManagerToDefault() {
      const moveTargetElemID = "workspace-menu";
      const appendElem = document.getElementById("workspace-button");

      appendElem.appendChild(document.getElementById(moveTargetElemID));
      workspaceFunctions.bmsWorkspaceFunctions.changeElementTag(
        moveTargetElemID,
        "menupopup"
      );
      document.getElementById("workspaceManagerBMSStyle").remove();
    },

    changeElementTag(elementId, newTagName) {
      const originalElement = document.getElementById(elementId);

      if (!originalElement) {
        console.error(`Element with id "${elementId}" not found.`);
        return;
      }

      const newTag = document.createElement(newTagName);

      for (const attr of originalElement.attributes) {
        newTag.setAttribute(attr.name, attr.value);
      }

      while (originalElement.firstChild) {
        newTag.appendChild(originalElement.firstChild);
      }

      originalElement.parentNode.replaceChild(newTag, originalElement);
    },
  },

  Backup: {
    async backupWorkspace() {
      //backup workspace tabs url
      let tabs = gBrowser.tabs;
      let tabsURL = [];
      for (let i = 0; i < tabs.length; i++) {
        let tabURL = tabs[i].linkedBrowser.currentURI.spec;
        tabsURL.push(tabURL);
      }

      let timeStamps = new Date().getTime();
      let tabsURLString = tabsURL.join(",");
      let workspaceState = Services.prefs.getStringPref(WORKSPACE_TABS_PREF);
      let workspaceAll = Services.prefs.getStringPref(WORKSPACE_ALL_PREF);
      let currentWorkspace = Services.prefs.getStringPref(
        WORKSPACE_CURRENT_PREF
      );

      let backupDataObject = {
        [timeStamps]: {
          tabsURL: tabsURLString,
          workspaceState,
          workspaceAll,
          currentWorkspace,
        },
      };

      let backupDataString = JSON.stringify(backupDataObject);

      // file tools
      const file = FileUtils.getFile("ProfD", ["floorp-workspace-backup.json"]);

      // Path tools
      const PROFILE_DIR = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
      const path = PathUtils.join(PROFILE_DIR, "floorp-workspace-backup.json");

      const encoder = new TextEncoder("UTF-8");
      const decoder = new TextDecoder("UTF-8");

      if (file.exists()) {
        //check lines
        let read = await IOUtils.read(path);
        let inputStream = decoder.decode(read);
        let lines = inputStream.split("\r");

        if (lines.length > 9) {
          lines.shift();
          inputStream = lines.join("\r");
          const doc = inputStream + backupDataString;
          const data = encoder.encode(doc);
          await IOUtils.write(path, data);
        }

        //ファイルの内容を取得し、backupDataString を追記し、ファイルを上書き保存する
        backupDataString = "\r" + backupDataString;
        const doc = inputStream + backupDataString;
        const data = encoder.encode(doc);
        await IOUtils.write(path, data);
        return;
      }

      //save backup data
      const data = encoder.encode(backupDataString);
      await IOUtils.write(path, data);
    },

    async restoreWorkspace(lineNum) {
      //check lineNum is number or Object. for about:preferences#workspaces
      if (typeof lineNum === "object") {
        lineNum = lineNum.wrappedJSObject.lineNum;
      }

      //hide all elements
      let tagElem = document.createElement("style");
      displayNoneCSS = ` #browser, #statusBar  {display: none !important;}`;
      tagElem.textContent = displayNoneCSS;
      document.head.appendChild(tagElem);

      // encoding tools
      const decoder = new TextDecoder("UTF-8");

      // Path tools
      const PROFILE_DIR = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
      const path = PathUtils.join(PROFILE_DIR, "floorp-workspace-backup.json");

      let read = await IOUtils.read(path);
      let inputStream = decoder.decode(read);

      //read backup data line by line
      let lines = inputStream.split("\r");
      let targetLine = lines[lineNum];

      //parse backup data
      let backupDataObject = JSON.parse(targetLine);
      let tabsURL =
        backupDataObject[Object.keys(backupDataObject)[0]].tabsURL.split(",");
      let workspaceState =
        backupDataObject[Object.keys(backupDataObject)[0]].workspaceState;
      let workspaceAll =
        backupDataObject[Object.keys(backupDataObject)[0]].workspaceAll;
      let currentWorkspace =
        backupDataObject[Object.keys(backupDataObject)[0]].currentWorkspace;

      //restore tabs
      let tabs = gBrowser.tabs;
      for (let i = 0; i < tabs.length; i++) {
        gBrowser.tabs[i].remove();
      }

      for (let i = 0; i < tabsURL.length; i++) {
        window.setTimeout(() => {
          gBrowser.addTab(tabsURL[i], {
            skipAnimation: true,
            inBackground: true,
            skipLoad: false,
            triggeringPrincipal:
              Services.scriptSecurityManager.getSystemPrincipal(),
          });
        }, 100);
      }

      //restore workspace
      Services.prefs.setStringPref(WORKSPACE_TABS_PREF, workspaceState);
      Services.prefs.setStringPref(WORKSPACE_ALL_PREF, workspaceAll);
      Services.prefs.setStringPref(WORKSPACE_CURRENT_PREF, currentWorkspace);
    },
  },
};

const setEvenyListeners = function () {
  gBrowser.tabContainer.addEventListener(
    "TabOpen",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabOpen
  );
  gBrowser.tabContainer.addEventListener(
    "TabClose",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabClose
  );
  gBrowser.tabContainer.addEventListener(
    "TabMove",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabMove
  );
  gBrowser.tabContainer.addEventListener(
    "TabSelect",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabSelect
  );

  gBrowser.tabContainer.addEventListener(
    "TabAttrModified",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "TabHide",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "TabShow",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "TabPinned",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "TabUnpinned",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "transitionend",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "dblclick",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "click",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "click",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver,
    true
  );

  gBrowser.tabContainer.addEventListener(
    "keydown",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver,
    { mozSystemGroup: true }
  );

  gBrowser.tabContainer.addEventListener(
    "dragstart",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "dragover",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "drop",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "dragend",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  gBrowser.tabContainer.addEventListener(
    "dragleave",
    workspaceFunctions.eventListeners.tabAddEventListeners.handleTabObeserver
  );

  Services.prefs.addObserver(
    WORKSPACE_CURRENT_PREF,
    workspaceFunctions.eventListeners.prefsEventListeners
      .handleWorkspacePrefChange
  );
  Services.prefs.addObserver(
    WORKSPACE_TAB_ENABLED_PREF,
    workspaceFunctions.eventListeners.prefsEventListeners
      .handleWorkspaceTabPrefChange
  );

  /*
  Services.prefs.addObserver(
    WORKSPACE_MANAGE_ON_BMS_PREF,
    workspaceFunctions.eventListeners.prefsEventListeners
       .handleWorkspaceManageOnBMSPrefChange
  );
  */

  document.addEventListener(
    "keydown",
    workspaceFunctions.eventListeners.keyboradEventListeners.handle_keydown
  );
};

startWorkspace = function () {
  let list = Services.wm.getEnumerator("navigator:browser");
  while (list.hasMoreElements()) {
    if (list.getNext() != window) {
      return;
    }
  }

  //use from about:prerferences
  Services.obs.addObserver(
    workspaceFunctions.Backup.restoreWorkspace,
    "backupWorkspace"
  );

  Services.obs.addObserver(
    workspaceFunctions.manageWorkspaceFunctions.addIconToWorkspace,
    "addIconToWorkspace"
  );

  // run code
  SessionStore.promiseInitialized.then(() => {
    // Bail out if the window has been closed in the meantime.
    if (window.closed) {
      return;
    }
    window.setTimeout(() => {
      Promise.all([
        workspaceFunctions.Backup.backupWorkspace(),
        workspaceFunctions.manageWorkspaceFunctions.initWorkspace(),
        workspaceFunctions.manageWorkspaceFunctions.setCurrentWorkspace(),
      ]).then(() => {
        setEvenyListeners();
        const manageOnBMS = Services.prefs.getBoolPref(
          WORKSPACE_MANAGE_ON_BMS_PREF
        );
        if (manageOnBMS) {
          workspaceFunctions.bmsWorkspaceFunctions.moveWorkspaceManagerToBMS();
        }
      });
    }, 500);
  });
};

//check if workspace tab is enabled and if there is a workspace tab group
const tabGroupAddonID = [
  "simple-tab-groups@drive4ik",
  "{3c078156-979c-498b-8990-85f7987dd929}",
  "panorama-tab-groups@example.com",
  "{60e27487-c779-464c-8698-ad481b718d5f}",
  "{3c078156-979c-498b-8990-85f7987dd929}",
];

async function checkTabGroupAddonInstalledAndStartWorkspace() {
  const workspaceTabEnabled = Services.prefs.getBoolPref(
    WORKSPACE_TAB_ENABLED_PREF
  );
  for (let i = 0; i < tabGroupAddonID.length; i++) {
    let addon = await AddonManager.getAddonByID(tabGroupAddonID[i]);
    if (addon === null) {
      continue;
    } else if (addon.isActive && workspaceTabEnabled) {
      return;
    }
  }
  startWorkspace();
}

checkTabGroupAddonInstalledAndStartWorkspace();
