type StreamFinalizeOptions = {
  onComplete?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onFinalize?: () => void | Promise<void>;
};

function toOptions(options: StreamFinalizeOptions | (() => void)): StreamFinalizeOptions {
  if (typeof options === "function") {
    return { onFinalize: options };
  }
  return options;
}

export function wrapStreamWithFinalizer(
  stream: ReadableStream<Uint8Array>,
  options: StreamFinalizeOptions | (() => void)
) {
  const resolvedOptions = toOptions(options);
  let finalized = false;
  const finalizeOnce = () => {
    if (finalized) return;
    finalized = true;
    void Promise.resolve(resolvedOptions.onFinalize?.()).catch((error) => {
      console.error("[streamUtils] finalizer failed", error);
    });
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();
      const pump = (): Promise<void> => {
        return reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              void Promise.resolve(resolvedOptions.onComplete?.()).catch((error) => {
                console.error("[streamUtils] completion hook failed", error);
              });
              finalizeOnce();
              controller.close();
              return;
            }
            if (value) controller.enqueue(value);
            return pump();
          })
          .catch((error) => {
            void Promise.resolve(resolvedOptions.onError?.(error)).catch((hookError) => {
              console.error("[streamUtils] error hook failed", hookError);
            });
            finalizeOnce();
            controller.error(error);
          });
      };
      void pump();
    },
    cancel(reason) {
      finalizeOnce();
      return stream.cancel(reason);
    },
  });
}
