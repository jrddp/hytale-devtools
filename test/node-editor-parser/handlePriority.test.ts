import { describe, expect, test, vi } from "vitest";
import { forwardPriorityConnection } from "../../webview/hytale-node-editor/src/node-editor/utils/handlePriority.svelte";

describe("handle priority connection forwarding", () => {
  test("forwards the raw connection when no before-connect hook is present", () => {
    const onConnect = vi.fn();
    const connection = {
      source: "source",
      sourceHandle: "Output",
      target: "target",
      targetHandle: "Input",
    };

    forwardPriorityConnection(connection, {
      onConnect,
    });

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith(connection);
  });

  test("forwards the transformed connection from onBeforeConnect", () => {
    const onConnect = vi.fn();
    const connection = {
      source: "source",
      sourceHandle: "Output",
      target: "target",
      targetHandle: "Input",
    };
    const transformedConnection = {
      ...connection,
      sourceHandle: "NormalizedOutput",
    };

    forwardPriorityConnection(connection, {
      onBeforeConnect: () => transformedConnection,
      onConnect,
    });

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith(transformedConnection);
  });

  test("does not forward when onBeforeConnect rejects the connection", () => {
    const onConnect = vi.fn();

    forwardPriorityConnection(
      {
        source: "source",
        sourceHandle: "Output",
        target: "target",
        targetHandle: "Input",
      },
      {
        onBeforeConnect: () => false,
        onConnect,
      },
    );

    expect(onConnect).not.toHaveBeenCalled();
  });
});
