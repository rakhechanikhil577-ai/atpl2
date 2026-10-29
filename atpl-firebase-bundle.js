/* ATPL Firebase & Cloud Unified Bridge (Zero-Hang, Cross-Browser Sync) */
(function() {
  "use strict";
  function noop() {}

  function getApiBase() {
    if (typeof window !== "undefined") {
      if (typeof window.ATPL_GET_API_BASE === "function") return window.ATPL_GET_API_BASE();
      if (window.__ATPL_CENTRAL_BACKEND_URL) return window.__ATPL_CENTRAL_BACKEND_URL;
    }
    return "";
  }

  var hrSubscribers = [];
  var hrTombSubscribers = [];
  var salSubscribers = [];
  var salTombSubscribers = [];

  var zo = function(k) {
    return "sf_" + encodeURIComponent(String(k || "").trim().toLowerCase()).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  };
  var hrKey = function(k) {
    return String(k || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  };

  var saveHrDocFb = async function(docObj) {
    if (!docObj || !docObj.id) return false;
    var meta = {
      id: String(docObj.id),
      document_name: String(docObj.document_name || docObj.name || "Untitled"),
      doc_type: String(docObj.doc_type || "Other"),
      updated_at:String(docObj.updated_at||new Date().toISOString())
    };
    try {
      var base = getApiBase();
      fetch(base + "/api/sync/hr-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, docObj, meta))
      }).catch(noop);
    } catch (_) {}
    return true;
  };

  var deleteHrDocFb = async function(id, docName, deletedBy) {
    if (!id) return false;
    try {
      var base = getApiBase();
      fetch(base + "/api/sync/hr-doc/" + encodeURIComponent(id) + "?user=" + encodeURIComponent(deletedBy || "admin"), {
        method: "DELETE"
      }).catch(noop);
    } catch (_) {}
    return true;
  };

  var fetchAllHrDocsFb = async function() {
    try {
      var base = getApiBase();
      var res = await fetch(base + "/api/sync/hr-docs");
      if (res && res.ok) {
        var data = await res.json();
        if (data && Array.isArray(data.docs)) return data.docs;
      }
    } catch (_) {}
    return [];
  };

  var fetchAllHrTombstonesFb = async function() {
    try {
      var base = getApiBase();
      var res = await fetch(base + "/api/sync/hr-docs");
      if (res && res.ok) {
        var data = await res.json();
        if (data && data.tombstones && typeof data.tombstones === "object") {
          return Object.values(data.tombstones);
        }
      }
    } catch (_) {}
    return [];
  };

  var subscribeHrDocsFb = function(onUpdate) {
    if (typeof onUpdate === "function") hrSubscribers.push(onUpdate);
    return function() {
      hrSubscribers = hrSubscribers.filter(function(fn) { return fn !== onUpdate; });
    };
  };

  var subscribeHrTombstonesFb = function(onTombstone) {
    if (typeof onTombstone === "function") hrTombSubscribers.push(onTombstone);
    return function() {
      hrTombSubscribers = hrTombSubscribers.filter(function(fn) { return fn !== onTombstone; });
    };
  };

  var decodeHrDocFb = async function(d) { return d; };

  var kI = async function(name, payload, meta) {
    if (!name) return false;
    try {
      var base = getApiBase();
      var b64 = (payload && payload.original_b64) || "";
      if (b64) {
        fetch(base + "/api/sync/salary-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
            buf: b64,
            sheets: (payload && payload.sheets) || null,
            saved: (meta && meta.saved_at) || new Date().toISOString(),
            uploaded_by: (meta && meta.uploaded_by) || "admin"
          })
        }).catch(noop);
      }
    } catch (_) {}
    return true;
  };

  var r_ = async function(name, deletedBy) {
    if (!name) return false;
    try {
      var base = getApiBase();
      fetch(base + "/api/sync/salary-file/" + encodeURIComponent(name) + "?user=" + encodeURIComponent(deletedBy || "admin"), {
        method: "DELETE"
      }).catch(noop);
    } catch (_) {}
    return true;
  };

  var MI = async function() {
    try {
      var base = getApiBase();
      fetch(base + "/api/sync/salary-clear-all", { method: "POST" }).catch(noop);
    } catch (_) {}
    return true;
  };

  var VI = async function(doc) { return doc; };

  var s_ = async function() {
    try {
      var base = getApiBase();
      var res = await fetch(base + "/api/sync/files-meta");
      if (res && res.ok) {
        var data = await res.json();
        if (data && Array.isArray(data.salary_files)) return data.salary_files;
      }
    } catch (_) {}
    return [];
  };

  var GI = async function() {
    try {
      var base = getApiBase();
      var res = await fetch(base + "/api/sync/files-meta");
      if (res && res.ok) {
        var data = await res.json();
        if (data && data.salary_tombstones && typeof data.salary_tombstones === "object") {
          return Object.values(data.salary_tombstones);
        }
      }
    } catch (_) {}
    return [];
  };

  var HI = function(onUpdate) {
    if (typeof onUpdate === "function") salSubscribers.push(onUpdate);
    return function() {
      salSubscribers = salSubscribers.filter(function(fn) { return fn !== onUpdate; });
    };
  };

  var UI = function(onTombstone) {
    if (typeof onTombstone === "function") salTombSubscribers.push(onTombstone);
    return function() {
      salTombSubscribers = salTombSubscribers.filter(function(fn) { return fn !== onTombstone; });
    };
  };

  if (typeof window !== "undefined") {
    window.__atplFirebaseQuotaExhausted = false;
    window.ATPLFirebase = {
      init: noop,
      saveSalaryFile: kI,
      deleteSalaryFile: r_,
      clearAllSalaryFiles: MI,
      decodeDocPayload: VI,
      fetchAllSalaryFiles: s_,
      fetchAllTombstones: GI,
      subscribeSalaryFiles: HI,
      subscribeTombstones: UI,
      safeKey: zo,
      saveHrDoc:saveHrDocFb,
      deleteHrDoc:deleteHrDocFb,
      decodeHrPayload:decodeHrDocFb,
      fetchAllHrDocs:fetchAllHrDocsFb,
      fetchAllHrTombstones:fetchAllHrTombstonesFb,
      subscribeHrDocs:subscribeHrDocsFb,
      subscribeHrTombstones:subscribeHrTombstonesFb,
      safeHrKey:hrKey,
      fetchAllEmployeeMaster:async function(){
        try {
          if (window.ATPLCloudAPI && typeof window.ATPLCloudAPI.request === "function") {
            var r = await window.ATPLCloudAPI.request({ action: "getEmployeeMaster" }, { timeout: 12000 });
            if (r && r.ok && Array.isArray(r.records)) return r.records;
          }
        } catch (_) {}
        try {
          var base = getApiBase();
          var res = await fetch(base + "/api/sync/state?summary=1");
          if (res && res.ok) {
            var st = await res.json();
            if (st && Array.isArray(st.employee_master)) return st.employee_master;
          }
        } catch (_) {}
        return [];
      }
    };
  }
})();
