/* dsh-skills-tools — browser half of the plugin (classic script bundle).
 *
 * Serves Settings -> Skills (settings.section, id "skills", order 19).
 * No module syntax: the DSH web loader evaluates this file as a classic script
 * through window.__ModuleLoader__.load({ id, factory }). Only React is required;
 * every icon, switch, modal and tag is implemented locally with --dsw tokens so
 * a primitives version skew cannot blank the panel.
 */
window.__ModuleLoader__.load({
  id: "dsh-skills-tools",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var NS = "skillsManager";
    var API_BASE = "/skills-tools/api";
    var POLL_INTERVAL_MS = 15000;
    var STYLE_ID = "dsh-skills-tools/SkillsManager.module.css";
    var SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useCallback = React.useCallback;
    var useRef = React.useRef;

    var CSS_TEXT = __SKM_CSS__;

    function cx() {
      var out = [];
      for (var i = 0; i < arguments.length; i += 1) {
        if (typeof arguments[i] === "string" && arguments[i] !== "") out.push(arguments[i]);
      }
      return out.join(" ");
    }

    function format(template, params) {
      if (!params) return template;
      return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, key) {
        return params[key] === undefined || params[key] === null ? match : String(params[key]);
      });
    }

    // ── Dictionaries: zh is the source of truth; en mirrors every key ──────
    var DICT = {
      zh: {
        nav: "技能",
        title: "技能",
        intro: "从 Git 仓库或本机目录导入 Agent Skills，随时启用或停用；停用的技能不会出现在 DSH 技能目录中。",
        refresh: "刷新",
        refreshing: "刷新中…",
        importSkill: "导入技能",
        importTitle: "导入技能",
        importDesc: "从 Git 仓库（GitHub、GitLab 或内网）或本机目录扫描 SKILL.md，选中后安装为只读快照。",
        urlLabel: "仓库 URL 或本机目录",
        urlPlaceholder: "https://github.com/org/repo.git 或 D:\\path\\to\\repo",
        refLabel: "分支 / 标签 / 提交（可选）",
        refPlaceholder: "留空使用远端默认分支",
        subdirLabel: "子目录（可选）",
        subdirPlaceholder: "例如 skills 或 plugins/foo/skills",
        scan: "扫描",
        scanning: "扫描中…",
        cancel: "取消",
        back: "返回",
        install: "安装选中",
        installing: "安装中…",
        installCount: "安装 {count} 个",
        scanSummary: "扫描到 {total} 个 SKILL.md，{valid} 个可安装",
        commitLabel: "提交 {commit}",
        noScanResults: "没有找到可安装的 skill。",
        duplicateHint: "重名，默认改名为 {name}",
        manualOnly: "仅手动",
        renamed: "原名为 {name}",
        invalid: "无法解析",
        selectAll: "全选",
        selectNone: "取消全选",
        filterAll: "全部",
        filterEnabled: "已启用",
        filterDisabled: "已停用",
        bulkEnable: "全部启用",
        bulkDisable: "全部停用",
        checkUpdates: "检查更新",
        checking: "检查中…",
        update: "从上游更新",
        updating: "更新中…",
        remove: "移除",
        removing: "移除中…",
        confirmRemoveTitle: "移除技能",
        confirmRemoveText: "从技能库中移除 {name}？当所属仓库的最后一个技能被移除时，快照也会被删除。",
        confirmRemove: "移除",
        viewSource: "来源",
        viewCommit: "提交",
        viewPath: "路径",
        viewUpdated: "更新于",
        viewContent: "SKILL.md",
        loadingContent: "加载中…",
        enabledState: "已启用，DSH 可发现",
        disabledState: "已停用，不会出现在技能目录",
        providerMissing: "技能 provider 未注册：请确认插件已加载并重启 DSH。",
        noSkills: "还没有导入任何技能",
        noSkillsHint: "点击右上角「导入技能」，粘贴 Git 仓库地址或本机目录即可开始。",
        noMatch: "没有匹配的技能",
        clearSearch: "清除搜索",
        alertInstalled: "已安装 {installed} 个技能，跳过 {skipped} 个。",
        alertToggled: "已{state} {name}",
        alertUpdated: "已从上游更新 {name}",
        alertRemoved: "已移除 {name}",
        alertChecked: "已检查 {count} 个仓库的更新",
        alertRefreshed: "已重新读取技能文件",
        alertBulk: "已更新 {count} 个技能",
        actionFailed: "操作失败：{message}",
        importFailed: "导入失败：{message}",
        scanFailed: "扫描失败：{message}",
        events: "最近操作",
        showEvents: "查看最近操作",
        hideEvents: "收起最近操作",
        providerLabel: "provider {name}",
        loadedInDsh: "DSH 已加载 {count}",
        summary: "已启用 {enabled} / 已导入 {total}",
        close: "关闭",
        retry: "重试",
        intranetHint: "内网仓库无需额外配置：直接使用本机 git 凭据（credential helper 或 SSH key），不会保存任何令牌。",
        updateAvailable: "有新提交",
        sourceHost: "来自 {host}",
        pathHint: "数据目录 {path}",
        importTip: "可填写分支、标签或提交，或用子目录缩小扫描范围。",
        badgeManual: "仅手动调用",
        badgeRenamed: "已改名",
        badgeUpdate: "可更新",
        badgeError: "加载失败",
        copyPath: "复制路径",
        copied: "已复制",
        scanningRepos: "正在克隆并扫描仓库…",
        localDirHint: "本机目录会复制为只读快照，原目录不会被修改。",
        quickToggle: "启用或停用",
        expand: "展开详情",
        collapse: "收起详情",
        needUrl: "请填写仓库 URL 或本机目录",
        reposTitle: "仓库",
        sourceLocal: "本机目录",
        summaryShort: "{enabled}/{total} 已启用",
        eventsEmpty: "暂无操作记录",
        nameLabel: "安装名称",
        emptyFiltered: "当前筛选下没有技能",
        checkedAt: "上次检查 {time}",
        noCredential: "如果克隆失败，请先在本机完成该仓库的 git 认证。",
        scanAgain: "重新扫描"
      },
      en: {
        nav: "Skills",
        title: "Skills",
        intro: "Import Agent Skills from a Git repository or a local folder, then enable or disable each one. Disabled skills are hidden from the DSH skill catalog.",
        refresh: "Refresh",
        refreshing: "Refreshing…",
        importSkill: "Import skills",
        importTitle: "Import skills",
        importDesc: "Scan SKILL.md files from a Git repository (GitHub, GitLab or an intranet host) or a local folder, then install the selected ones as read-only snapshots.",
        urlLabel: "Repository URL or local folder",
        urlPlaceholder: "https://github.com/org/repo.git or D:\\path\\to\\repo",
        refLabel: "Branch / tag / commit (optional)",
        refPlaceholder: "Leave empty for the remote default branch",
        subdirLabel: "Subdirectory (optional)",
        subdirPlaceholder: "e.g. skills or plugins/foo/skills",
        scan: "Scan",
        scanning: "Scanning…",
        cancel: "Cancel",
        back: "Back",
        install: "Install selected",
        installing: "Installing…",
        installCount: "Install {count}",
        scanSummary: "{total} SKILL.md found, {valid} installable",
        commitLabel: "commit {commit}",
        noScanResults: "No installable skill found.",
        duplicateHint: "Name clash, will install as {name}",
        manualOnly: "Manual only",
        renamed: "Originally {name}",
        invalid: "Unparseable",
        selectAll: "Select all",
        selectNone: "Clear selection",
        filterAll: "All",
        filterEnabled: "Enabled",
        filterDisabled: "Disabled",
        bulkEnable: "Enable all",
        bulkDisable: "Disable all",
        checkUpdates: "Check updates",
        checking: "Checking…",
        update: "Update from upstream",
        updating: "Updating…",
        remove: "Remove",
        removing: "Removing…",
        confirmRemoveTitle: "Remove skill",
        confirmRemoveText: "Remove {name} from the library? The snapshot is deleted when the last skill of its repository is removed.",
        confirmRemove: "Remove",
        viewSource: "Source",
        viewCommit: "Commit",
        viewPath: "Path",
        viewUpdated: "Updated",
        viewContent: "SKILL.md",
        loadingContent: "Loading…",
        enabledState: "Enabled and discoverable by DSH",
        disabledState: "Disabled and hidden from the skill catalog",
        providerMissing: "The skills provider is not registered. Check that the plugin loaded, then restart DSH.",
        noSkills: "No skills imported yet",
        noSkillsHint: "Click Import skills in the top right and paste a Git repository URL or a local folder.",
        noMatch: "No matching skills",
        clearSearch: "Clear search",
        alertInstalled: "Installed {installed} skill(s), skipped {skipped}.",
        alertToggled: "{name} {state}",
        alertUpdated: "Updated {name} from upstream",
        alertRemoved: "Removed {name}",
        alertChecked: "Checked {count} repository update(s)",
        alertRefreshed: "Reloaded skill files",
        alertBulk: "Updated {count} skill(s)",
        actionFailed: "Action failed: {message}",
        importFailed: "Import failed: {message}",
        scanFailed: "Scan failed: {message}",
        events: "Recent activity",
        showEvents: "Show recent activity",
        hideEvents: "Hide recent activity",
        providerLabel: "provider {name}",
        loadedInDsh: "{count} loaded by DSH",
        summary: "{enabled} enabled / {total} imported",
        close: "Close",
        retry: "Retry",
        intranetHint: "Intranet repositories just work: your local git credentials (credential helper or SSH key) are reused and no token is stored.",
        updateAvailable: "New commit",
        sourceHost: "from {host}",
        pathHint: "Data folder {path}",
        importTip: "Optionally pin a branch, tag or commit, or narrow the scan with a subdirectory.",
        badgeManual: "Manual only",
        badgeRenamed: "Renamed",
        badgeUpdate: "Update",
        badgeError: "Load error",
        copyPath: "Copy path",
        copied: "Copied",
        scanningRepos: "Cloning and scanning the repository…",
        localDirHint: "A local folder is copied into a read-only snapshot; the original is never modified.",
        quickToggle: "Enable or disable",
        expand: "Expand details",
        collapse: "Collapse details",
        needUrl: "Enter a repository URL or a local folder",
        reposTitle: "Repositories",
        sourceLocal: "Local folder",
        summaryShort: "{enabled}/{total} enabled",
        eventsEmpty: "No activity yet",
        nameLabel: "Install name",
        emptyFiltered: "No skills match this filter",
        checkedAt: "Checked {time}",
        noCredential: "If cloning fails, complete git authentication for this repository on this machine first.",
        scanAgain: "Scan again"
      }
    };

    function makeTranslator(bound) {
      return function t(key, params) {
        var template;
        if (typeof bound === "function") {
          try { template = bound(key, params) } catch (error) { template = undefined }
        }
        if (typeof template !== "string" || template === "" || template === key) {
          template = Object.prototype.hasOwnProperty.call(DICT.zh, key) ? DICT.zh[key] : String(key);
        }
        return format(template, params);
      };
    }

    // ── Styles ────────────────────────────────────────────────────────────
    var stylesInjected = false;
    function injectStyles() {
      if (stylesInjected) return;
      try {
        if (typeof document === "undefined" || !document.head) return;
        if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')) { stylesInjected = true; return }
        var tag = document.createElement("style");
        tag.dataset.plugin = "dsh-skills-tools";
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS_TEXT;
        document.head.appendChild(tag);
        stylesInjected = true;
      } catch (error) {
        try { console.warn("[dsh-skills-tools] failed to inject styles", error) } catch (ignored) {}
      }
    }

    // ── Icons (inline, 16px, currentColor) ────────────────────────────────
    var ICONS = {
      search: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "m15.2 15.2 4.3 4.3"],
      refresh: ["M20 11a8 8 0 1 0-2.3 6.7", "M20 5v6h-6"],
      plus: ["M12 5v14", "M5 12h14"],
      chevron: ["m9 6 6 6-6 6"],
      trash: ["M4 7h16", "M9 7V5h6v2", "M7 7l1 12h8l1-12", "M10 11v4", "M14 11v4"],
      download: ["M12 4v10", "m8 10 4 4 4-4", "M5 19h14"],
      x: ["M6 6l12 12", "M18 6 6 18"],
      check: ["m5 12 4 4 10-10"],
      info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 11v5", "M12 8h.01"],
      alert: ["M12 4 3 20h18L12 4Z", "M12 10v4", "M12 17h.01"],
      copy: ["M9 9h10v10H9Z", "M5 15V5h10"],
      clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
      folder: ["M3 7h7l2 2h9v10H3Z"],
      external: ["M14 4h6v6", "M20 4 11 13", "M18 14v5H5V6h5"],
      box: ["M4 8 12 4l8 4v8l-8 4-8-4Z", "M4 8l8 4 8-4", "M12 12v8"]
    };

    function Icon(props) {
      var paths = ICONS[props.name] || ICONS.info;
      var children = [];
      for (var i = 0; i < paths.length; i += 1) {
        children.push(h("path", { key: "p" + i, d: paths[i] }));
      }
      return h("svg", {
        width: props.size || 16,
        height: props.size || 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: props.strokeWidth || 1.7,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
        focusable: "false",
        className: props.className
      }, children);
    }

    // ── Primitives ────────────────────────────────────────────────────────
    function Button(props) {
      var variant = props.variant || "outline";
      var children = [];
      if (props.icon) children.push(h(Icon, { key: "i", name: props.icon, size: props.iconSize || 14 }));
      if (props.children !== undefined && props.children !== null) children.push(h("span", { key: "t" }, props.children));
      return h("button", {
        type: "button",
        className: cx("skm-btn", "skm-btn--" + variant, props.className),
        disabled: !!props.disabled,
        onClick: props.onClick,
        title: props.title,
        "aria-label": props.ariaLabel,
        "data-loading": props.loading ? "true" : "false"
      }, children);
    }

    function IconButton(props) {
      return h("button", {
        type: "button",
        className: cx("skm-ibtn", props.className),
        disabled: !!props.disabled,
        onClick: props.onClick,
        title: props.title,
        "aria-label": props.label || props.title,
        "data-danger": props.danger ? "true" : "false"
      }, h(Icon, { name: props.icon, size: 15, className: props.spin ? "skm-spin" : undefined }));
    }

    function Switch(props) {
      var checked = !!props.checked;
      return h("button", {
        type: "button",
        role: "switch",
        "aria-checked": checked,
        "aria-label": props.label,
        title: props.title || props.label,
        disabled: !!props.disabled,
        className: "skm-switch",
        onClick: function (event) {
          event.stopPropagation();
          if (typeof props.onChange === "function") props.onChange(!checked);
        }
      });
    }

    function Tag(props) {
      return h("span", { className: "skm-tag", "data-tone": props.tone || "outline" }, props.children);
    }

    function Spinner(props) {
      return h(Icon, { name: "refresh", size: props.size || 14, className: "skm-spin" });
    }

    var modalSeq = 0;
    function Modal(props) {
      var panelRef = useRef(null);
      var titleIdRef = useRef(null);
      if (titleIdRef.current == null) {
        modalSeq += 1;
        titleIdRef.current = "skm-modal-title-" + modalSeq;
      }
      useEffect(function () {
        if (!props.open) return undefined;
        var previous = typeof document !== "undefined" ? document.activeElement : null;
        var onKeyDown = function (event) {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (typeof props.onClose === "function") props.onClose();
          }
        };
        if (typeof document !== "undefined") document.addEventListener("keydown", onKeyDown, true);
        var timer = setTimeout(function () {
          if (panelRef.current && typeof panelRef.current.focus === "function") panelRef.current.focus();
        }, 0);
        return function () {
          clearTimeout(timer);
          if (typeof document !== "undefined") document.removeEventListener("keydown", onKeyDown, true);
          if (previous && typeof previous.focus === "function") { try { previous.focus() } catch (error) {} }
        };
      }, [props.open]);
      if (!props.open) return null;
      var head = h("div", { className: "skm-modalHead" },
        h("div", { style: { flex: "1 1 auto", minWidth: 0 } },
          h("h2", { className: "skm-modalTitle", id: titleIdRef.current }, props.title),
          props.description ? h("p", { className: "skm-modalDesc" }, props.description) : null),
        h(IconButton, { icon: "x", label: props.closeLabel || "Close", onClick: props.onClose }));
      return h("div", {
        className: "skm-overlay",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose() }
      },
        h("div", {
          className: "skm-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleIdRef.current,
          tabIndex: -1,
          ref: panelRef,
          "data-width": props.wide ? "wide" : "normal"
        },
          head,
          h("div", { className: "skm-modalBody" }, props.children),
          props.footer ? h("div", { className: "skm-modalFooter" }, props.footer) : null));
    }

    // ── API ───────────────────────────────────────────────────────────────
    function requestApi(path, init) {
      var options = Object.assign({ credentials: "same-origin" }, init || {});
      return fetch(API_BASE + path, options).then(function (response) {
        return response.json().catch(function () {
          return { ok: false, error: "HTTP " + String(response.status) };
        }).then(function (payload) {
          if (!response.ok || !payload || payload.ok === false) {
            var message = payload && payload.error ? payload.error : "HTTP " + String(response.status);
            throw new Error(typeof message === "string" ? message : JSON.stringify(message));
          }
          return payload;
        });
      });
    }
    function apiGet(path) { return requestApi(path, { method: "GET" }); }
    function apiPost(path, body) {
      return requestApi(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body === undefined ? {} : body)
      });
    }

    function hostOf(url) {
      if (typeof url !== "string" || url === "") return "";
      try { return new URL(url).host || url } catch (error) { return url }
    }

    function shortTime(value) {
      if (!value) return "";
      try {
        var date = new Date(value);
        if (isNaN(date.getTime())) return "";
        var pad = function (n) { return n < 10 ? "0" + n : String(n) };
        return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
      } catch (error) { return "" }
    }

    function errorMessage(error) {
      return String((error && error.message) || error || "unknown");
    }

    // ── Import dialog ─────────────────────────────────────────────────────
    function ImportDialog(props) {
      var t = props.t;
      var _step = useState("form");
      var step = _step[0], setStep = _step[1];
      var _url = useState("");
      var url = _url[0], setUrl = _url[1];
      var _ref = useState("");
      var ref = _ref[0], setRef = _ref[1];
      var _subdir = useState("");
      var subdir = _subdir[0], setSubdir = _subdir[1];
      var _scan = useState(null);
      var scan = _scan[0], setScan = _scan[1];
      var _selected = useState({});
      var selected = _selected[0], setSelected = _selected[1];
      var _names = useState({});
      var names = _names[0], setNames = _names[1];
      var _busy = useState(false);
      var busy = _busy[0], setBusy = _busy[1];
      var _error = useState("");
      var error = _error[0], setError = _error[1];

      function doScan() {
        var target = url.trim();
        if (!target) { setError(t("needUrl")); return }
        setBusy(true);
        setError("");
        apiPost("/import/scan", { url: target, ref: ref.trim(), subdir: subdir.trim() }).then(function (result) {
          setScan(result);
          var sel = {};
          var nextNames = {};
          for (var i = 0; i < result.skills.length; i += 1) {
            var skill = result.skills[i];
            if (!skill.valid) continue;
            sel[skill.relPath] = true;
            nextNames[skill.relPath] = skill.suggestedName || skill.name;
          }
          setSelected(sel);
          setNames(nextNames);
          setStep("scan");
        }).catch(function (failure) {
          setError(t("scanFailed", { message: errorMessage(failure) }));
        }).then(function () { setBusy(false) });
      }

      function numberSelected() {
        if (!scan) return 0;
        var count = 0;
        for (var i = 0; i < scan.skills.length; i += 1) {
          if (scan.skills[i].valid && selected[scan.skills[i].relPath]) count += 1;
        }
        return count;
      }

      function selectAll(on) {
        if (!scan) return;
        var next = {};
        for (var i = 0; i < scan.skills.length; i += 1) {
          var skill = scan.skills[i];
          if (skill.valid) next[skill.relPath] = !!on;
        }
        setSelected(next);
      }

      function doInstall() {
        if (!scan) return;
        var list = [];
        var bad = "";
        for (var i = 0; i < scan.skills.length; i += 1) {
          var skill = scan.skills[i];
          if (!skill.valid || !selected[skill.relPath]) continue;
          var name = (names[skill.relPath] || skill.suggestedName || skill.name).trim();
          if (!SKILL_NAME_RE.test(name)) bad = name;
          list.push({ relPath: skill.relPath, name: name });
        }
        if (bad) { setError(t("actionFailed", { message: "名称不合法：" + bad })); return }
        if (list.length === 0) { setError(t("selectSkill") || t("noScanResults")); return }
        setBusy(true);
        setError("");
        apiPost("/import/commit", { scanId: scan.scanId, skills: list }).then(function (result) {
          props.onDone(result);
        }).catch(function (failure) {
          setError(t("importFailed", { message: errorMessage(failure) }));
        }).then(function () { setBusy(false) });
      }

      var footer;
      if (step === "form") {
        footer = [
          h("div", { key: "grow", className: "skm-grow" }),
          h(Button, { key: "cancel", variant: "ghost", onClick: props.onClose, disabled: busy }, t("cancel")),
          h(Button, { key: "scan", variant: "primary", onClick: doScan, disabled: busy, loading: busy }, busy ? t("scanning") : t("scan"))
        ];
      } else {
        var count = numberSelected();
        footer = [
          h(Button, { key: "back", variant: "ghost", onClick: function () { setStep("form"); setError("") }, disabled: busy }, t("back")),
          h("div", { key: "grow", className: "skm-grow" }),
          h(Button, { key: "cancel", variant: "ghost", onClick: props.onClose, disabled: busy }, t("cancel")),
          h(Button, { key: "install", variant: "primary", onClick: doInstall, disabled: busy || count === 0 }, busy ? t("installing") : t("installCount", { count: count }))
        ];
      }

      var children;
      if (step === "form") {
        children = [
          h("div", { key: "url", className: "skm-field" },
            h("label", { className: "skm-fieldLabel", htmlFor: "skm-import-url" }, t("urlLabel")),
            h("input", {
              id: "skm-import-url",
              className: "skm-input",
              value: url,
              placeholder: t("urlPlaceholder"),
              autoFocus: true,
              spellCheck: false,
              onChange: function (event) { setUrl(event.target.value); setError("") },
              onKeyDown: function (event) { if (event.key === "Enter") doScan() }
            }),
            h("p", { className: "skm-hint" }, t("intranetHint")),
            h("p", { className: "skm-hint" }, t("localDirHint"))),
          h("div", { key: "row", className: "skm-fieldRow" },
            h("div", { className: "skm-field" },
              h("label", { className: "skm-fieldLabel", htmlFor: "skm-import-ref" }, t("refLabel")),
              h("input", {
                id: "skm-import-ref",
                className: "skm-input",
                value: ref,
                placeholder: t("refPlaceholder"),
                spellCheck: false,
                onChange: function (event) { setRef(event.target.value); setError("") }
              })),
            h("div", { className: "skm-field" },
              h("label", { className: "skm-fieldLabel", htmlFor: "skm-import-subdir" }, t("subdirLabel")),
              h("input", {
                id: "skm-import-subdir",
                className: "skm-input",
                value: subdir,
                placeholder: t("subdirPlaceholder"),
                spellCheck: false,
                onChange: function (event) { setSubdir(event.target.value); setError("") }
              }))),
          h("p", { key: "tip", className: "skm-hint" }, t("importTip")),
          busy ? h("div", { key: "busy", className: "skm-banner", "data-tone": "warn" }, h(Spinner, {}), t("scanningRepos")) : null,
          error ? h("p", { key: "err", className: "skm-inlineErr", role: "alert" }, error) : null
        ];
      } else {
        var rows = [];
        for (var i = 0; i < scan.skills.length; i += 1) {
          (function (skill) {
            var checked = !!selected[skill.relPath];
            var value = names[skill.relPath] || skill.suggestedName || skill.name;
            rows.push(h("div", {
              key: skill.relPath,
              className: "skm-scanRow",
              "data-invalid": skill.valid ? "false" : "true"
            },
              h("input", {
                type: "checkbox",
                checked: checked,
                disabled: !skill.valid || busy,
                "aria-label": value,
                onChange: function (event) {
                  var next = Object.assign({}, selected);
                  next[skill.relPath] = event.target.checked;
                  setSelected(next);
                }
              }),
              h("div", { className: "skm-scanMain" },
                h("div", { className: "skm-scanName" },
                  h("span", {}, skill.name || skill.relPath),
                  skill.duplicate ? h(Tag, { tone: "warn" }, t("duplicateHint", { name: skill.suggestedName })) : null,
                  !skill.valid ? h(Tag, { tone: "error" }, t("invalid")) : null),
                h("span", { className: "skm-scanPath" }, skill.relPath),
                !skill.valid ? h("span", { className: "skm-scanPath" }, skill.reason) : null),
              skill.valid ? h("input", {
                className: "skm-scanNameInput",
                value: value,
                "aria-label": t("nameLabel"),
                spellCheck: false,
                disabled: busy,
                title: t("nameLabel"),
                onChange: function (event) {
                  var next = Object.assign({}, names);
                  next[skill.relPath] = event.target.value;
                  setNames(next);
                }
              }) : null));
          })(scan.skills[i]);
        }
        var validCount = scan.skills.filter(function (skill) { return skill.valid }).length;
        children = [
          h("div", { key: "summary", className: "skm-scanHead" },
            h("span", {}, t("scanSummary", { total: scan.skills.length, valid: validCount })),
            scan.commit ? h("code", {}, t("commitLabel", { commit: String(scan.commit).slice(0, 8) })) : null,
            scan.source && scan.source.kind === "local" ? h(Tag, {}, t("sourceLocal")) : null,
            h("div", { className: "skm-grow", style: { flex: "1 1 auto" } }),
            h(Button, { variant: "ghost", onClick: function () { selectAll(true) }, disabled: busy }, t("selectAll")),
            h(Button, { variant: "ghost", onClick: function () { selectAll(false) }, disabled: busy }, t("selectNone"))),
          scan.warnings && scan.warnings.length > 0 ? h("div", { key: "warn", className: "skm-banner", "data-tone": "warn" },
            h(Icon, { name: "alert" }),
            h("div", {}, scan.warnings.map(function (warning, index) { return h("div", { key: index }, warning) }))) : null,
          h("div", { key: "list", className: "skm-scanList" }, rows),
          scan.skills.length === 0 ? h("p", { key: "empty", className: "skm-hint" }, t("noScanResults")) : null,
          error ? h("p", { key: "err", className: "skm-inlineErr", role: "alert" }, error) : null
        ];
      }

      return h(Modal, {
        open: true,
        onClose: busy ? function () {} : props.onClose,
        title: t("importTitle"),
        description: t("importDesc"),
        closeLabel: t("close"),
        wide: step === "scan",
        footer: footer
      }, children);
    }

    // ── Confirmation dialog ───────────────────────────────────────────────
    function ConfirmDialog(props) {
      var t = props.t;
      var _busy = useState(false);
      var busy = _busy[0], setBusy = _busy[1];
      function run() {
        setBusy(true);
        props.onConfirm().then(function () { props.onClose(); }).catch(function () { setBusy(false) });
      }
      return h(Modal, {
        open: true,
        onClose: busy ? function () {} : props.onClose,
        title: props.title || t("confirmRemoveTitle"),
        closeLabel: t("close"),
        footer: [
          h("div", { key: "grow", className: "skm-grow" }),
          h(Button, { key: "cancel", variant: "ghost", onClick: props.onClose, disabled: busy }, t("cancel")),
          h(Button, { key: "ok", variant: "danger", onClick: run, disabled: busy }, props.confirmLabel || t("confirmRemove"))
        ]
      }, h("p", { className: "skm-hint", style: { fontSize: "13px", lineHeight: "20px" } }, props.message));
    }

    // ── Section ───────────────────────────────────────────────────────────
    function SkillsSection(props) {
      var t = props.t;
      var _data = useState(null);
      var data = _data[0], setData = _data[1];
      var _loading = useState(true);
      var loading = _loading[0], setLoading = _loading[1];
      var _error = useState("");
      var error = _error[0], setError = _error[1];
      var _query = useState("");
      var query = _query[0], setQuery = _query[1];
      var _filter = useState("all");
      var filter = _filter[0], setFilter = _filter[1];
      var _expanded = useState({});
      var expanded = _expanded[0], setExpanded = _expanded[1];
      var _content = useState({});
      var content = _content[0], setContent = _content[1];
      var _busy = useState({});
      var busy = _busy[0], setBusy = _busy[1];
      var _alert = useState(null);
      var alert = _alert[0], setAlert = _alert[1];
      var _importOpen = useState(false);
      var importOpen = _importOpen[0], setImportOpen = _importOpen[1];
      var _confirm = useState(null);
      var confirm = _confirm[0], setConfirm = _confirm[1];
      var _eventsOpen = useState(false);
      var eventsOpen = _eventsOpen[0], setEventsOpen = _eventsOpen[1];
      var _copied = useState("");
      var copied = _copied[0], setCopied = _copied[1];

      var load = useCallback(function (silent) {
        return apiGet("/state").then(function (next) {
          setData(next);
          setError("");
          if (!silent) setLoading(false);
        }).catch(function (failure) {
          setError(errorMessage(failure));
          if (!silent) setLoading(false);
        });
      }, []);

      useEffect(function () {
        load(false);
        if (typeof window === "undefined") return undefined;
        var timer = setInterval(function () {
          if (document.visibilityState === "hidden") return;
          load(true);
        }, POLL_INTERVAL_MS);
        var onVisible = function () { if (document.visibilityState !== "hidden") load(true) };
        document.addEventListener("visibilitychange", onVisible);
        return function () {
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
        };
      }, [load]);

      useEffect(function () {
        if (!alert) return undefined;
        var timer = setTimeout(function () { setAlert(null) }, 7000);
        return function () { clearTimeout(timer) };
      }, [alert]);

      function setBusyFor(name, action) {
        setBusy(function (previous) {
          var next = Object.assign({}, previous);
          if (action) next[name] = action;
          else delete next[name];
          return next;
        });
      }

      function isBusy(name) { return !!busy[name] }

      function toggleSkill(skill) {
        if (isBusy(skill.name)) return;
        var nextEnabled = !skill.enabled;
        setBusyFor(skill.name, "toggle");
        setData(function (previous) {
          if (!previous) return previous;
          return Object.assign({}, previous, {
            skills: previous.skills.map(function (item) {
              return item.name === skill.name ? Object.assign({}, item, { enabled: nextEnabled, loaded: nextEnabled }) : item;
            }),
            summary: Object.assign({}, previous.summary, {
              enabled: previous.summary.enabled + (nextEnabled ? 1 : -1),
              loaded: previous.summary.loaded + (nextEnabled ? 1 : -1)
            })
          });
        });
        apiPost("/skills/toggle", { name: skill.name, enabled: nextEnabled }).then(function () {
          setAlert({ tone: "ok", text: t("alertToggled", { state: nextEnabled ? t("enabled") : t("disabled"), name: skill.name }) });
          return load(true);
        }).catch(function (failure) {
          setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
          return load(true);
        }).then(function () { setBusyFor(skill.name, null) });
      }

      function bulk(action) {
        setBusyFor("__bulk__", action);
        apiPost("/skills/bulk", { action: action }).then(function (result) {
          setAlert({ tone: "ok", text: t("alertBulk", { count: result.changed || 0 }) });
          return load(true);
        }).catch(function (failure) {
          setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
        }).then(function () { setBusyFor("__bulk__", null) });
      }

      function checkUpdates() {
        setBusyFor("__check__", "check");
        apiPost("/repos/check-updates", {}).then(function (result) {
          setAlert({ tone: "ok", text: t("alertChecked", { count: (result.repos || []).length }) });
          return load(true);
        }).catch(function (failure) {
          setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
        }).then(function () { setBusyFor("__check__", null) });
      }

      function refreshFiles() {
        setBusyFor("__refresh__", "refresh");
        apiPost("/refresh", {}).then(function (result) {
          setAlert({ tone: "ok", text: t("alertRefreshed") });
          return load(true);
        }).catch(function (failure) {
          setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
        }).then(function () { setBusyFor("__refresh__", null) });
      }

      function updateSkill(skill) {
        if (isBusy(skill.name)) return;
        setBusyFor(skill.name, "update");
        apiPost("/skills/update", { name: skill.name }).then(function () {
          setAlert({ tone: "ok", text: t("alertUpdated", { name: skill.name }) });
          setContent(function (previous) { var next = Object.assign({}, previous); delete next[skill.name]; return next });
          return load(true);
        }).catch(function (failure) {
          setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
        }).then(function () { setBusyFor(skill.name, null) });
      }

      function askRemove(skill) {
        setConfirm({
          name: skill.name,
          message: t("confirmRemoveText", { name: skill.name }),
          onConfirm: function () {
            return apiPost("/skills/remove", { name: skill.name }).then(function () {
              setAlert({ tone: "ok", text: t("alertRemoved", { name: skill.name }) });
              return load(true);
            }).catch(function (failure) {
              setAlert({ tone: "error", text: t("actionFailed", { message: errorMessage(failure) }) });
              throw failure;
            });
          }
        });
      }

      function expandSkill(skill) {
        var open = !expanded[skill.name];
        setExpanded(function (previous) {
          var next = Object.assign({}, previous);
          if (open) next[skill.name] = true; else delete next[skill.name];
          return next;
        });
        if (open && !content[skill.name]) fetchContent(skill.name);
      }

      function fetchContent(name) {
        setContent(function (previous) {
          return Object.assign({}, previous, { [name]: { loading: true, text: "", error: "" } });
        });
        apiGet("/skills/content?name=" + encodeURIComponent(name)).then(function (result) {
          setContent(function (previous) {
            return Object.assign({}, previous, { [name]: { loading: false, text: result.content || "", error: "", truncated: !!result.truncated } });
          });
        }).catch(function (failure) {
          setContent(function (previous) {
            return Object.assign({}, previous, { [name]: { loading: false, text: "", error: errorMessage(failure) } });
          });
        });
      }

      function copyPath(skill) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(skill.path || "");
            setCopied(skill.name);
            setTimeout(function () { setCopied("") }, 1500);
          }
        } catch (error) {}
      }

      var skills = data ? data.skills || [] : [];
      var counts = useMemo(function () {
        var enabled = 0;
        for (var i = 0; i < skills.length; i += 1) if (skills[i].enabled) enabled += 1;
        return { all: skills.length, enabled: enabled, disabled: skills.length - enabled };
      }, [skills]);

      var filtered = useMemo(function () {
        var needle = query.trim().toLowerCase();
        return skills.filter(function (skill) {
          if (filter === "enabled" && !skill.enabled) return false;
          if (filter === "disabled" && skill.enabled) return false;
          if (!needle) return true;
          var haystack = [skill.name, skill.description, skill.relPath, skill.repo ? skill.repo.url : ""].join(" ").toLowerCase();
          return haystack.indexOf(needle) >= 0;
        });
      }, [skills, query, filter]);

      function renderDetail(skill) {
        var entry = content[skill.name];
        var actions = [
          h(Button, {
            key: "update",
            variant: "outline",
            icon: "download",
            disabled: isBusy(skill.name),
            onClick: function () { updateSkill(skill) }
          }, isBusy(skill.name) ? t("updating") : t("update")),
          h(Button, {
            key: "remove",
            variant: "danger",
            icon: "trash",
            disabled: isBusy(skill.name),
            onClick: function () { askRemove(skill) }
          }, t("remove")),
          h("div", { key: "grow", className: "skm-grow" }),
          h(Button, {
            key: "copy",
            variant: "ghost",
            icon: "copy",
            onClick: function () { copyPath(skill) }
          }, copied === skill.name ? t("copied") : t("copyPath"))
        ];
        var repoUrl = skill.repo ? skill.repo.url : "";
        return h("div", { className: "skm-detail" },
          h("dl", { className: "skm-detailGrid" },
            h("dt", {}, t("viewSource")),
            h("dd", {}, repoUrl || "-"),
            h("dt", {}, t("viewCommit")),
            h("dd", {}, skill.repo && skill.repo.commit ? h("code", {}, String(skill.repo.commit).slice(0, 12)) : t("sourceLocal")),
            h("dt", {}, t("viewPath")),
            h("dd", {}, h("code", {}, skill.path || skill.relPath)),
            h("dt", {}, t("viewUpdated")),
            h("dd", {}, shortTime(skill.updatedAt) || "-")),
          h("div", { className: "skm-detailActions" }, actions),
          h("p", { className: "skm-codeNote" }, skill.enabled ? t("enabledState") : t("disabledState")),
          h("div", { className: "skm-codeWrap" },
            entry && entry.loading ? h("div", { className: "skm-loading" }, h(Spinner, {}), t("loadingContent")) : null,
            entry && entry.error ? h("p", { className: "skm-inlineErr" }, entry.error) : null,
            entry && entry.text ? h("pre", { className: "skm-code" }, entry.text) : null,
            entry && entry.truncated ? h("p", { className: "skm-codeNote" }, "…") : null));
      }

      function renderRow(skill) {
        var open = !!expanded[skill.name];
        var badges = [];
        if (skill.invocation && skill.invocation.modelInvocable === false) badges.push(h(Tag, { key: "manual" }, t("manualOnly")));
        if (skill.renamed) badges.push(h(Tag, { key: "renamed", tone: "accent" }, t("badgeRenamed")));
        if (skill.repo && skill.repo.updateAvailable) badges.push(h(Tag, { key: "update", tone: "warn" }, t("badgeUpdate")));
        if (skill.lastError) badges.push(h(Tag, { key: "error", tone: "error" }, t("badgeError")));
        var meta = [];
        if (skill.repo) {
          meta.push(h("span", { key: "host" }, skill.repo.kind === "local" ? t("sourceLocal") : hostOf(skill.repo.url)));
          if (skill.repo.shortCommit) meta.push(h("code", { key: "commit" }, skill.repo.shortCommit));
        }
        meta.push(h("code", { key: "rel" }, skill.relPath));
        return h("li", { key: skill.name, className: "skm-row", "data-off": skill.enabled ? "false" : "true" },
          h("div", { className: "skm-rowHead" },
            h(Switch, {
              checked: skill.enabled,
              disabled: isBusy(skill.name),
              label: t("quickToggle") + " " + skill.name,
              onChange: function () { toggleSkill(skill) }
            }),
            h("button", {
              type: "button",
              className: "skm-rowMain",
              onClick: function () { expandSkill(skill) },
              "aria-expanded": open,
              "aria-label": t(open ? "collapse" : "expand") + " " + skill.name
            },
              h("span", { className: "skm-nameRow" },
                h("span", { className: "skm-name" }, skill.name),
                badges),
              h("span", { className: "skm-desc" }, skill.description || ""),
              h("span", { className: "skm-meta" }, meta)),
            h("div", { className: "skm-rowActions" },
              h("span", { className: "skm-chevron", "data-open": open ? "true" : "false" }, h(Icon, { name: "chevron", size: 15 })))),
          open ? renderDetail(skill) : null);
      }

      var header = h("div", { className: "skm-headRow" },
        h("div", { className: "skm-headText" },
          h("h1", { className: "skm-heading" }, t("title")),
          h("p", { className: "skm-intro" }, t("intro"))),
        h("div", { className: "skm-headActions" },
          h(IconButton, {
            icon: "refresh",
            label: t("refresh"),
            title: t("refresh"),
            disabled: !!busy.__refresh__,
            spin: !!busy.__refresh__,
            onClick: refreshFiles
          }),
          h(Button, { variant: "primary", icon: "plus", onClick: function () { setImportOpen(true) } }, t("importSkill"))));

      if (loading && !data) {
        return h("section", { className: "skm-root" }, header,
          h("div", { className: "skm-loading" }, h(Spinner, { size: 16 }), t("refreshing")));
      }

      if (!data) {
        return h("section", { className: "skm-root" }, header,
          h("div", { className: "skm-banner", "data-tone": "error", role: "alert" },
            h(Icon, { name: "alert" }),
            h("div", {}, error || t("providerMissing"))),
          h("div", {},
            h(Button, { variant: "outline", onClick: function () { setLoading(true); load(false) } }, t("retry"))));
      }

      var summaryLine = h("div", { className: "skm-toolbar" },
        h("div", { className: "skm-summary" },
          h("span", {}, t("summary", { enabled: data.summary ? data.summary.enabled : 0, total: data.summary ? data.summary.total : 0 })),
          h("span", { "aria-hidden": "true" }, "·"),
          h("strong", {}, t("loadedInDsh", { count: data.summary ? data.summary.loaded : 0 }))),
        h("div", { className: "skm-toolbarEnd" },
          h(Button, { variant: "ghost", onClick: function () { bulk("all") }, disabled: !!busy.__bulk__ }, t("bulkEnable")),
          h(Button, { variant: "ghost", onClick: function () { bulk("none") }, disabled: !!busy.__bulk__ }, t("bulkDisable")),
          h(Button, { variant: "ghost", icon: "download", onClick: checkUpdates, disabled: !!busy.__check__ }, busy.__check__ ? t("checking") : t("checkUpdates")),
          h(Button, { variant: "ghost", icon: "clock", onClick: function () { setEventsOpen(!eventsOpen) } }, eventsOpen ? t("hideEvents") : t("showEvents"))));

      var toolbar = h("div", { className: "skm-toolbar" },
        h("label", { className: "skm-search" },
          h(Icon, { name: "search", size: 15 }),
          h("input", {
            value: query,
            placeholder: t("noMatch"),
            "aria-label": t("noMatch"),
            onChange: function (event) { setQuery(event.target.value) },
            spellCheck: false
          }),
          query ? h("button", {
            type: "button",
            className: "skm-ibtn",
            style: { width: "18px", height: "18px" },
            "aria-label": t("clearSearch"),
            title: t("clearSearch"),
            onClick: function () { setQuery("") }
          }, h(Icon, { name: "x", size: 12 })) : null),
        h("div", { className: "skm-toolbarEnd" },
          h("div", { className: "skm-seg", role: "tablist" },
            [["all", t("filterAll"), counts.all], ["enabled", t("filterEnabled"), counts.enabled], ["disabled", t("filterDisabled"), counts.disabled]].map(function (entry) {
              return h("button", {
                key: entry[0],
                type: "button",
                role: "tab",
                "aria-selected": filter === entry[0],
                "data-active": filter === entry[0] ? "true" : "false",
                className: "skm-segBtn",
                onClick: function () { setFilter(entry[0]) }
              }, entry[1] + " " + entry[2]);
            }))));

      var notice = alert ? h("div", { className: "skm-banner", "data-tone": alert.tone === "error" ? "error" : "warn", role: "status" },
        h(Icon, { name: alert.tone === "error" ? "alert" : "check" }),
        h("div", { style: { flex: "1 1 auto" } }, alert.text),
        h(IconButton, { icon: "x", label: t("close"), onClick: function () { setAlert(null) } })) : null;

      var providerNotice = !data.provider || !data.provider.registered
        ? h("div", { className: "skm-banner", "data-tone": "warn" }, h(Icon, { name: "alert" }), h("div", {}, t("providerMissing")))
        : null;

      var list;
      if (skills.length === 0) {
        list = h("div", { className: "skm-empty" },
          h(Icon, { name: "box", size: 26 }),
          h("div", { className: "skm-emptyTitle" }, t("noSkills")),
          h("div", { className: "skm-emptyText" }, t("noSkillsHint")),
          h(Button, { variant: "primary", icon: "plus", onClick: function () { setImportOpen(true) } }, t("importSkill")));
      } else if (filtered.length === 0) {
        list = h("div", { className: "skm-empty" },
          h(Icon, { name: "search", size: 24 }),
          h("div", { className: "skm-emptyTitle" }, t("noMatch")));
      } else {
        list = h("ul", { className: "skm-list" }, filtered.map(renderRow));
      }

      var repos = data.repos || [];
      var repoBlock = repos.length > 0 ? h("details", { className: "skm-repos" },
        h("summary", { className: "skm-detailsSummary" }, t("reposTitle") + " " + repos.length),
        h("div", { className: "skm-events" }, repos.map(function (repo) {
          return h("div", { key: repo.id },
            h("span", { style: { flex: "1 1 auto", overflowWrap: "anywhere" } }, repo.url),
            h("span", {}, (repo.ref || "HEAD") + " · " + (repo.shortCommit || t("sourceLocal"))),
            h("span", {}, repo.enabled + "/" + repo.skills),
            repo.updateAvailable ? h(Tag, { tone: "warn" }, t("updateAvailable")) : null);
        }))) : null;

      var events = data.events || [];
      var eventsBlock = eventsOpen ? h("div", { className: "skm-events" },
        events.length === 0 ? h("div", {}, t("eventsEmpty")) : events.slice().reverse().map(function (event, index) {
          return h("div", { key: index },
            h("time", {}, shortTime(event.at)),
            h("span", { style: { flex: "1 1 auto" } }, event.message));
        })) : null;

      return h("section", { className: "skm-root" },
        header,
        summaryLine,
        providerNotice,
        notice,
        toolbar,
        list,
        repoBlock,
        eventsBlock,
        h("p", { className: "skm-hint" }, t("pathHint", { path: data.paths ? data.paths.manager : "" })),
        importOpen ? h(ImportDialog, {
          t: t,
          onClose: function () { setImportOpen(false) },
          onDone: function (result) {
            setImportOpen(false);
            setAlert({
              tone: result.skipped && result.skipped.length > 0 ? "warn" : "ok",
              text: t("alertInstalled", { installed: result.installed.length, skipped: (result.skipped || []).length })
            });
            load(true);
          }
        }) : null,
        confirm ? h(ConfirmDialog, {
          t: t,
          title: t("confirmRemoveTitle"),
          message: confirm.message,
          confirmLabel: t("confirmRemove"),
          onClose: function () { setConfirm(null) },
          onConfirm: confirm.onConfirm
        }) : null);
    }

    // ── Plugin wiring ─────────────────────────────────────────────────────
    function getLocaleService(ctx) {
      try {
        if (ctx && ctx.locale) return ctx.locale;
        if (ctx && typeof ctx.get === "function") {
          var service = ctx.get("locale");
          if (service) return service;
        }
      } catch (error) { return null }
      return null;
    }

    function apply(ctx) {
      injectStyles();
      var locale = getLocaleService(ctx);
      var bound = null;
      if (locale && typeof locale.register === "function") {
        var registerDictionaries = function () { return locale.register(NS, { zh: DICT.zh, en: DICT.en }) };
        try {
          if (typeof ctx.effect === "function") ctx.effect(registerDictionaries, "skills-manager: dictionaries");
          else registerDictionaries();
        } catch (error) {
          try { console.warn("[dsh-skills-tools] locale registration skipped", error) } catch (ignored) {}
        }
      }
      if (locale && typeof locale.bind === "function") {
        try { bound = locale.bind(NS) } catch (error) { bound = null }
      }
      var t = makeTranslator(bound);
      var slots = ctx && ctx.slots;
      if (slots && typeof slots.inject === "function" && typeof slots.register === "function") {
        try {
          slots.inject("settings.section", function () {
            return slots.register({
              name: "settings.section",
              id: "skills",
              order: 19,
              label: function () { return t("nav") },
              locale: NS,
              inject: function () { return {} }
            }, function SkillsSectionBound(props) { return h(SkillsSection, Object.assign({}, props, { t: t })) });
          });
        } catch (error) {
          try { console.error("[dsh-skills-tools] failed to register the settings section", error) } catch (ignored) {}
        }
      }
    }

    var inject = ["slots", "locale"];

    exports.inject = inject;
    exports.apply = apply;
    exports.SkillsSection = SkillsSection;
    return module.exports;
  }
});
