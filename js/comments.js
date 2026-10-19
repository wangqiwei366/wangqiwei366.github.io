(function () {
  "use strict";

  var SESSION_KEY = "kimi-comment-session-v1";

  function readSession() {
    try {
      var value = JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
      if (value && typeof value.token === "string" && value.token && value.user) return value;
    } catch (error) {
      // Ignore malformed local state and start signed out.
    }
    return null;
  }

  function saveSession(session) {
    // Storage can be unavailable in private browsing or when the origin has
    // reached its quota. A failed persistence attempt must not break the
    // current page session or leave the account form half-updated.
    try {
      if (!session) {
        window.localStorage.removeItem(SESSION_KEY);
        return;
      }
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      // Keep the in-memory session for this page view.
    }
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function init(root) {
    if (root.dataset.commentsReady === "true") return;
    root.dataset.commentsReady = "true";

    var apiBase = (root.dataset.apiBase || "").replace(/\/+$/, "");
    var articleId = root.dataset.articleId || window.location.pathname;
    var elements = {
      count: root.querySelector("[data-comments-count]"),
      status: root.querySelector("[data-comments-status]"),
      list: root.querySelector("[data-comments-list]"),
      auth: root.querySelector("[data-comments-auth]"),
      user: root.querySelector("[data-comments-user]"),
      nickname: root.querySelector("[data-user-nickname]"),
      userId: root.querySelector("[data-user-id]"),
      logout: root.querySelector("[data-logout]"),
      message: root.querySelector("[data-auth-message]"),
      commentForm: root.querySelector("[data-comment-form]"),
    };
    var session = readSession();
    var comments = [];

    function setStatus(message, kind) {
      elements.status.textContent = message || "";
      elements.status.dataset.kind = kind || "";
    }

    function setMessage(message, kind) {
      elements.message.textContent = message || "";
      elements.message.dataset.kind = kind || "";
    }

    function api(path, options) {
      options = options || {};
      var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
      if (session && session.token) headers.Authorization = "Bearer " + session.token;
      return fetch(apiBase + path, Object.assign({}, options, { headers: headers })).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (error) { data = {}; }
          if (!response.ok || data.ok === false) {
            var failure = new Error(data.error || "请求失败，请稍后重试");
            failure.status = response.status;
            throw failure;
          }
          return data;
        });
      });
    }

    function renderComments() {
      elements.list.replaceChildren();
      elements.count.textContent = comments.length ? comments.length + " 条评论" : "暂时没有评论";
      if (!comments.length) {
        elements.list.appendChild(createElement("p", "comments-empty", "还没有评论，来留下第一条吧。"));
        return;
      }
      comments.slice().reverse().forEach(function (comment) {
        var item = createElement("article", "comments-item");
        var header = createElement("header", "comments-item-header");
        var identity = createElement("div", "comments-item-identity");
        identity.appendChild(createElement("strong", "comments-item-name", comment.nickname || "访客"));
        if (comment.userId) identity.appendChild(createElement("code", "comments-item-id", comment.userId));
        header.appendChild(identity);
        header.appendChild(createElement("time", "comments-item-time", formatDate(comment.createdAt)));
        item.appendChild(header);
        item.appendChild(createElement("p", "comments-item-body", comment.body || ""));
        elements.list.appendChild(item);
      });
    }

    function renderAccount() {
      var loggedIn = Boolean(session && session.token && session.user);
      elements.auth.hidden = loggedIn;
      elements.user.hidden = !loggedIn;
      elements.commentForm.hidden = !loggedIn;
      if (loggedIn) {
        elements.nickname.textContent = session.user.nickname || "用户";
        elements.userId.textContent = session.user.id || "";
        setMessage("");
      }
    }

    function setBusy(form, busy) {
      form.querySelectorAll("button, input, textarea").forEach(function (field) {
        field.disabled = busy;
      });
      form.classList.toggle("is-busy", busy);
    }

    function selectAuthTab(tab) {
      root.querySelectorAll("[data-auth-tab]").forEach(function (button) {
        var active = button.dataset.authTab === tab;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
      });
      root.querySelectorAll("[data-auth-form]").forEach(function (form) {
        form.hidden = form.dataset.authForm !== tab;
      });
      setMessage("");
    }

    function loadComments() {
      if (!apiBase) {
        setStatus("评论服务未配置", "error");
        elements.list.replaceChildren(createElement("p", "comments-empty", "评论服务暂时不可用。"));
        return Promise.resolve();
      }
      return api("/comments?article=" + encodeURIComponent(articleId))
        .then(function (data) {
          comments = Array.isArray(data.comments) ? data.comments : [];
          renderComments();
          setStatus("");
        })
        .catch(function () {
          elements.list.replaceChildren(createElement("p", "comments-empty", "评论加载失败，请稍后刷新页面重试。"));
          elements.count.textContent = "评论暂不可用";
          setStatus("加载失败", "error");
        });
    }

    function refreshSession() {
      if (!session || !session.token) {
        renderAccount();
        return Promise.resolve();
      }
      return api("/auth/me").then(function (data) {
        if (!data.user) {
          session = null;
          saveSession(null);
        } else {
          session.user = data.user;
          saveSession(session);
        }
        renderAccount();
      }).catch(function () {
        session = null;
        saveSession(null);
        renderAccount();
      });
    }

    root.querySelectorAll("[data-auth-tab]").forEach(function (button) {
      button.addEventListener("click", function () { selectAuthTab(button.dataset.authTab); });
    });

    root.querySelector('[data-auth-form="login"]').addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var data = new FormData(form);
      setMessage("");
      setBusy(form, true);
      api("/auth/login", { method: "POST", body: JSON.stringify({ id: data.get("id"), password: data.get("password") }) })
        .then(function (result) {
          if (!result || typeof result.token !== "string" || !result.token || !result.user) {
            throw new Error("登录响应无效，请稍后重试");
          }
          session = { token: result.token, user: result.user };
          saveSession(session);
          form.reset();
          renderAccount();
          setStatus("登录成功", "success");
          return loadComments();
        })
        .catch(function (error) { setMessage(error.message, "error"); })
        .finally(function () { setBusy(form, false); });
    });

    root.querySelector('[data-auth-form="register"]').addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var data = new FormData(form);
      var password = String(data.get("password") || "");
      if (password !== String(data.get("passwordConfirm") || "")) {
        setMessage("两次输入的密码不一致", "error");
        return;
      }
      setMessage("");
      setBusy(form, true);
      api("/auth/register", { method: "POST", body: JSON.stringify({ nickname: data.get("nickname"), password: password }) })
        .then(function (result) {
          var id = result.user && result.user.id ? result.user.id : "";
          form.reset();
          selectAuthTab("login");
          var loginId = root.querySelector('[data-auth-form="login"] input[name="id"]');
          if (loginId) { loginId.value = id; loginId.focus(); }
          setMessage("注册成功，你的用户 ID 是 " + id + "，请使用它登录。", "success");
        })
        .catch(function (error) { setMessage(error.message, "error"); })
        .finally(function () { setBusy(form, false); });
    });

    elements.logout.addEventListener("click", function () {
      var oldSession = session;
      session = null;
      saveSession(null);
      renderAccount();
      setStatus("已退出登录", "success");
      if (oldSession) api("/auth/logout", { method: "POST" }).catch(function () {});
    });

    elements.commentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!session || !session.token) return renderAccount();
      var form = event.currentTarget;
      var body = String(new FormData(form).get("body") || "").trim();
      if (!body) return;
      setBusy(form, true);
      api("/comments", { method: "POST", body: JSON.stringify({ articleId: articleId, body: body }) })
        .then(function (result) {
          if (result.comment) comments.push(result.comment);
          renderComments();
          form.reset();
          setStatus("评论已发布", "success");
        })
        .catch(function (error) {
          if (error.status === 401) {
            session = null;
            saveSession(null);
            renderAccount();
          }
          setStatus(error.message, "error");
        })
        .finally(function () { setBusy(form, false); });
    });

    renderAccount();
    Promise.all([loadComments(), refreshSession()]);
  }

  function start() {
    document.querySelectorAll("[data-comments-root]").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}());
