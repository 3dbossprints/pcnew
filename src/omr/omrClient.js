let nextRequestId = 1;

export function createOmrClient({ onProgress = () => {}, onLog = () => {} } = {}) {
  const worker = new Worker("/omr-worker.js", { type: "module" });
  const pending = new Map();
  let readyResolve;
  let readyReject;
  let readySettled = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

  function rejectAll(error) {
    if (!readySettled) {
      readySettled = true;
      readyReject(error);
    }
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  worker.addEventListener("message", event => {
    const message = event.data || {};
    if (message.type === "progress") {
      onProgress(message);
      return;
    }
    if (message.type === "log") {
      onLog(message.msg || "");
      return;
    }
    if (message.type === "ready") {
      if (!readySettled) {
        readySettled = true;
        readyResolve({ gpu: Boolean(message.gpu) });
      }
      return;
    }
    if (message.type === "error") {
      const error = new Error(message.msg || "Local OMR could not process this page.");
      if (!readySettled) {
        readySettled = true;
        readyReject(error);
      }
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry.reject(error);
      }
      return;
    }
    if (message.type === "result") {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      entry.resolve({ xml: message.xml, durationMs: Number(message.ms) || 0 });
    }
  });

  worker.addEventListener("error", event => {
    rejectAll(new Error(event.message || "The local OMR worker stopped unexpectedly."));
  });
  worker.postMessage({ type: "init" });

  return {
    ready,
    async recognise(imageBlob, systems = "") {
      await ready;
      const id = nextRequestId++;
      const bytes = await imageBlob.arrayBuffer();
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: "recognise", id, image: bytes, systems }, [bytes]);
      });
    },
    terminate() {
      rejectAll(new Error("Local score recognition was cancelled."));
      worker.terminate();
    },
  };
}
