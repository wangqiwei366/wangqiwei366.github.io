(function () {
  "use strict";
  var tab = "comments", offset = 0, credential = "", revision = 0, busy = false;
  var list = document.getElementById("moderationList");
  var status = document.getElementById("moderationStatus");
  function node(tag, className, text) {
    var item = document.createElement(tag); item.className = className || "";
    if (text !== undefined) item.textContent = text; return item;
  }
  function password() { return credential || state.password; }
  async function request(path, options) {
    if (!password()) throw new Error("请先输入管理密码连接评论管理。");
    var response = await fetch(state.apiBase + path, Object.assign({}, options, {
      cache: "no-store", headers: { "Content-Type": "application/json", "X-Admin-Password": password() }
    }));
    var data = await response.json();
    if (!response.ok || !data.ok) {
      if (response.status === 401) { credential = ""; list.replaceChildren(); document.getElementById("moderationConnection").hidden = false; }
      throw new Error(data.error || "操作失败，请稍后重试");
    }
    return data;
  }
  function button(text, callback, danger) {
    var item = node("button", "ghost" + (danger ? " danger" : ""), text);
    item.type = "button"; item.onclick = callback; item.disabled = busy; return item;
  }
  async function change(path, method, payload, message) {
    if (busy) return;
    busy = true; revision += 1;
    list.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    try { await request(path, { method: method, body: JSON.stringify(payload) }); toast(message); }
    catch (error) { toast(error.message); }
    finally { busy = false; await load(); }
  }
  function render(items) {
    list.replaceChildren();
    if (!items.length) list.appendChild(node("p", "meta", "没有匹配的" + (tab === "comments" ? "评论" : "用户") + "。"));
    items.forEach(function (item) {
      var row = node("article", "moderation-item");
      var info = node("div", "moderation-info");
      info.appendChild(node("strong", "", item.nickname + " · ID " + (item.userId || item.id)));
      if (tab === "comments") {
        info.appendChild(node("p", "moderation-body", item.body));
        info.appendChild(node("p", "meta", item.articleId));
      } else {
        info.appendChild(node("p", "meta", (item.disabled ? "已停用" : "正常") + " · " + item.commentCount + " 条评论"));
      }
      info.appendChild(node("time", "meta", new Date(item.createdAt).toLocaleString("zh-CN")));
      var actions = node("div", "actions");
      if (tab === "comments") {
        actions.appendChild(button("删除评论", function () {
          if (window.confirm("删除这条评论？所有客户端都会同步删除，无法撤销。")) change("/admin/comments", "DELETE", { id: item.id }, "评论已删除");
        }, true));
      } else {
        actions.appendChild(button("修改昵称", function () {
          var nickname = window.prompt("修改昵称（1–40 字，会同步到该用户已有评论）", item.nickname);
          if (nickname !== null && nickname.trim() && nickname.trim() !== item.nickname) {
            if (nickname.trim().length > 40) return toast("昵称不能超过 40 字");
            change("/admin/users", "POST", { id: item.id, nickname: nickname.trim() }, "昵称已更新");
          }
        }));
        actions.appendChild(button(item.disabled ? "恢复账号" : "停用账号", function () {
          var message = item.disabled ? "恢复该账号？用户可重新登录并发表评论。" : "停用该账号？已有登录将失效，用户无法登录和发表评论；历史评论保留。";
          if (window.confirm(message)) change("/admin/users", "POST", { id: item.id, disabled: !item.disabled }, item.disabled ? "账号已恢复" : "账号已停用");
        }, !item.disabled));
      }
      row.append(info, actions); list.appendChild(row);
    });
  }
  async function load() {
    if (busy) return;
    var expected = ++revision;
    if (!password()) { status.textContent = "请输入管理密码连接评论管理。"; return; }
    var search = document.getElementById("moderationSearch").value.trim();
    try {
      var data = await request("/admin/" + tab + "?offset=" + offset + "&q=" + encodeURIComponent(search));
      if (expected !== revision) return;
      document.getElementById("moderationConnection").hidden = true;
      render(data[tab] || []);
      status.textContent = "本人评论在各端优先显示；列表按最新时间排列。";
      document.getElementById("moderationPrev").disabled = offset === 0;
      document.getElementById("moderationNext").disabled = !data.hasMore;
      document.getElementById("moderationPage").textContent = "第 " + (offset / 50 + 1) + " 页";
    } catch (error) { if (expected === revision) status.textContent = error.message; }
  }
  document.querySelectorAll("[data-moderation-tab]").forEach(function (button) {
    button.onclick = function () {
      if (busy) return; tab = button.dataset.moderationTab; offset = 0; revision += 1; list.replaceChildren();
      document.getElementById("moderationSearch").placeholder = tab === "comments" ? "评论内容、昵称、用户 ID 或文章路径" : "昵称或用户 ID";
      document.querySelectorAll("[data-moderation-tab]").forEach(function (b) { b.classList.toggle("active", b === button); b.setAttribute("aria-selected", String(b === button)); });
      load();
    };
  });
  document.getElementById("moderationConnect").onclick = function () {
    credential = document.getElementById("moderationPassword").value;
    document.getElementById("moderationPassword").value = ""; load();
  };
  document.getElementById("moderationSearchForm").onsubmit = function (event) { event.preventDefault(); if (!busy) { offset = 0; load(); } };
  document.getElementById("moderationRefresh").onclick = load;
  document.getElementById("moderationPrev").onclick = function () { if (!busy && offset) { offset -= 50; load(); } };
  document.getElementById("moderationNext").onclick = function () { if (!busy) { offset += 50; load(); } };
  document.querySelector('[data-view="comments"]').addEventListener("click", load);
  window.addEventListener("admin-connection-reset", function () {
    credential = ""; revision += 1; offset = 0; list.replaceChildren();
    document.getElementById("moderationConnection").hidden = false; status.textContent = "连接后可查看评论与用户。";
  });
  setInterval(function () { if (!document.hidden && password() && document.getElementById("commentsView").classList.contains("active")) load(); }, 10000);
}());
