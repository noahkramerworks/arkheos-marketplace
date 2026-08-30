import { contracts } from "../mcp/operations.mjs";

export class MockObs {
  constructor({ failOn = null, hideCreatedInput = false } = {}) {
    this.failOn = failOn;
    this.hideCreatedInput = hideCreatedInput;
    this.calls = [];
    this.scenes = [{ sceneName: "Existing", sceneUuid: "scene-existing", sceneIndex: 0 }];
    this.inputs = [];
    this.sceneItems = new Map([["Existing", []]]);
    this.inputKinds = ["browser_source", "color_source_v3", "image_source"];
    this.closed = false;
    this.version = {
      obsVersion: "32.2.1",
      obsWebSocketVersion: "5.7.0",
      rpcVersion: 1,
      availableRequests: [...new Set(contracts.APPLY_REQUESTS)],
    };
  }

  async connect() {}

  async call(requestType, requestData = {}) {
    this.calls.push({ requestType, requestData });
    if (this.failOn === requestType) throw new Error(`injected failure: ${requestType}`);
    switch (requestType) {
      case "GetVersion": return structuredClone(this.version);
      case "GetSceneList": return { scenes: structuredClone(this.scenes), currentProgramSceneName: this.scenes[0]?.sceneName };
      case "GetInputList": return { inputs: structuredClone(this.hideCreatedInput ? this.inputs.filter((item) => !item.created) : this.inputs).map(({ created: _created, ...item }) => item) };
      case "GetInputKindList": return { inputKinds: [...this.inputKinds] };
      case "GetVideoSettings": return { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 };
      case "GetSceneItemList": return { sceneItems: structuredClone(this.sceneItems.get(requestData.sceneName) || []) };
      case "CreateScene": {
        if (this.scenes.some((scene) => scene.sceneName === requestData.sceneName)) throw new Error("scene exists");
        this.scenes.push({ sceneName: requestData.sceneName, sceneUuid: `scene-${this.scenes.length}`, sceneIndex: this.scenes.length });
        this.sceneItems.set(requestData.sceneName, []);
        return {};
      }
      case "CreateInput": {
        if (!this.sceneItems.has(requestData.sceneName)) throw new Error("scene missing");
        if (this.inputs.some((input) => input.inputName === requestData.inputName)) throw new Error("input exists");
        this.inputs.push({ inputName: requestData.inputName, inputUuid: `input-${this.inputs.length}`, inputKind: requestData.inputKind, unversionedInputKind: requestData.inputKind, created: true });
        this.sceneItems.get(requestData.sceneName).push({ sceneItemId: this.inputs.length, sourceName: requestData.inputName, inputKind: requestData.inputKind, sceneItemEnabled: requestData.sceneItemEnabled });
        return { sceneItemId: this.inputs.length };
      }
      case "RemoveInput": {
        this.inputs = this.inputs.filter((input) => input.inputName !== requestData.inputName);
        for (const [scene, items] of this.sceneItems) this.sceneItems.set(scene, items.filter((item) => item.sourceName !== requestData.inputName));
        return {};
      }
      case "RemoveScene": {
        this.scenes = this.scenes.filter((scene) => scene.sceneName !== requestData.sceneName);
        this.sceneItems.delete(requestData.sceneName);
        return {};
      }
      default: throw new Error(`unsupported mock request: ${requestType}`);
    }
  }

  close() { this.closed = true; }

  clientFactory() { return this; }
}
