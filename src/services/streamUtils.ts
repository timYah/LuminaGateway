export function wrapStreamWithFinalizer(
  stream: ReadableStream<Uint8Array>,
  onFinalize: () => void
) {
  let finalized = false;
  const finalizeOnce = () => {
    if (finalized) return;
    finalized = true;
    onFinalize();
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = stream.getReader();
      const pump = (): Promise<void> => {
        return reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              finalizeOnce();
              controller.close();
              return;
            }
            if (value) controller.enqueue(value);
            return pump();
          })
          .catch((error) => {
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
