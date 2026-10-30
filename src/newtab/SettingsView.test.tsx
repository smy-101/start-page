import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BookmarkState } from "../domain/types";
import { SCHEMA_VERSION } from "../domain/store";
import { createMemoryStorage } from "../storage/memoryStorage";
import { SettingsView } from "./SettingsView";
import type { BackgroundSetting } from "./settings";

// 背景分区(seam 3):选色/取色/上传/恢复默认的交互接线;
// 压缩器注入假实现,真实解码管线不在此测(seam 2 口径)
const baseState: BookmarkState = {
  schemaVersion: SCHEMA_VERSION,
  groups: [],
  bookmarks: [],
};

function renderView(
  overrides: {
    background?: BackgroundSetting;
    onBackgroundChange?: (next: BackgroundSetting) => void;
    compressImage?: (file: File) => Promise<string>;
  } = {}
) {
  const onBackgroundChange =
    overrides.onBackgroundChange ?? vi.fn(async () => {});
  render(
    <SettingsView
      onBack={() => {}}
      state={baseState}
      adapter={createMemoryStorage(baseState)}
      onImported={() => {}}
      iconFetch={true}
      onToggleIconFetch={() => {}}
      background={overrides.background ?? { kind: "default" }}
      onBackgroundChange={onBackgroundChange}
      compressImage={overrides.compressImage}
    />
  );
  return { onBackgroundChange };
}

function pickFile(file: File) {
  fireEvent.change(screen.getByLabelText("上传图片"), {
    target: { files: [file] },
  });
}

describe("设置页背景分区:图片上传", () => {
  it("选图后经压缩上报图片背景(data URL)", async () => {
    const compressImage = vi.fn(async () => "data:image/webp;base64,QUJD");
    const { onBackgroundChange } = renderView({ compressImage });

    pickFile(new File(["bytes"], "wall.png", { type: "image/png" }));

    await waitFor(() =>
      expect(onBackgroundChange).toHaveBeenCalledWith({
        kind: "image",
        dataUrl: "data:image/webp;base64,QUJD",
      })
    );
    expect(compressImage).toHaveBeenCalledTimes(1);
  });

  it("压缩期间显示处理中状态,结束后消失", async () => {
    let release!: (value: string) => void;
    const compressImage = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        })
    );
    renderView({ compressImage });

    pickFile(new File(["bytes"], "wall.png", { type: "image/png" }));

    expect(await screen.findByRole("status", { name: "背景处理中" }));
    release("data:image/webp;base64,QUJD");
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "背景处理中" })).toBeNull()
    );
  });

  it("非图片或解码失败:中文提示且不改动背景", async () => {
    const compressImage = vi.fn(async () => {
      throw new Error("not-an-image");
    });
    const { onBackgroundChange } = renderView({ compressImage });

    pickFile(new File(["bytes"], "note.txt", { type: "text/plain" }));

    expect(
      await screen.findByText("无法读取该图片,请换一张试试")
    ).toBeInTheDocument();
    expect(onBackgroundChange).not.toHaveBeenCalled();
  });

  it("当前为图片背景时显示预览", async () => {
    renderView({
      background: {
        kind: "image",
        dataUrl: "data:image/webp;base64,QUJD",
      },
    });

    const preview = screen.getByAltText("背景预览");
    expect(preview).toHaveAttribute("src", "data:image/webp;base64,QUJD");
  });
});

describe("设置页背景分区:纯色", () => {
  it("策展色板选色即上报纯色背景", async () => {
    const { onBackgroundChange } = renderView();

    const group = screen.getByRole("radiogroup", { name: "背景颜色" });
    const first = group.querySelector<HTMLInputElement>("input[type=radio]")!;
    fireEvent.click(first);

    expect(onBackgroundChange).toHaveBeenCalledWith({
      kind: "color",
      color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
  });

  it("自由取色器选任意色上报该色", async () => {
    const { onBackgroundChange } = renderView();

    fireEvent.change(screen.getByLabelText("自定义颜色"), {
      target: { value: "#ab9ce2" },
    });

    expect(onBackgroundChange).toHaveBeenCalledWith({
      kind: "color",
      color: "#ab9ce2",
    });
  });

  it("恢复默认上报 default;当前已是默认时仍可点(幂等)", async () => {
    const { onBackgroundChange } = renderView({
      background: { kind: "color", color: "#e9ebef" },
    });

    fireEvent.click(screen.getByRole("button", { name: "恢复默认背景" }));

    expect(onBackgroundChange).toHaveBeenCalledWith({ kind: "default" });
  });

  it("当前为纯色背景时,对应色点带选中态", async () => {
    renderView({ background: { kind: "color", color: "#15181c" } });

    const checked = screen
      .getAllByRole("radio")
      .find((radio) => (radio as HTMLInputElement).checked);
    expect((checked as HTMLInputElement).value).toBe("#15181c");
  });
});
