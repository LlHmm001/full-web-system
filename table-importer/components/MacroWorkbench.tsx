"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ImportDbResponse,
  Macro,
  MacroRunResponse,
  WorkbookPreview,
  WorkbookUploadResponse
} from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">加载编辑器...</div>
});

type RequestState = "idle" | "busy";

interface WorkbookState {
  workbookId: string;
  sheetNames: string[];
  preview: WorkbookPreview;
}

const buttonBase =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50";
const primaryButton = `${buttonBase} bg-teal-600 text-white hover:bg-teal-700`;
const secondaryButton = `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const dangerButton = `${buttonBase} border border-red-200 bg-white text-red-600 hover:bg-red-50`;
const inputClass =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

export default function MacroWorkbench() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [selectedMacroId, setSelectedMacroId] = useState<string>("");
  const [macroName, setMacroName] = useState("");
  const [macroCode, setMacroCode] = useState("");
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [tableName, setTableName] = useState("");
  const [headerRow, setHeaderRow] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [runResult, setRunResult] = useState<MacroRunResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportDbResponse | null>(null);
  const [titleValue, setTitleValue] = useState("");
  const [colors, setColors] = useState<{ id: number; colour: string }[]>([]);
  const [svgCode, setSvgCode] = useState("");

  const selectedMacro = useMemo(
    () => macros.find((macro) => macro.id === selectedMacroId) ?? null,
    [macros, selectedMacroId]
  );

  useEffect(() => {
    void refreshMacros();
    void loadTitle();
    void loadColors();
    void loadSvg();
  }, []);

  async function loadTitle() {
    try {
      const data = await api<{ value: string }>("/api/config/title");
      setTitleValue(data.value);
    } catch { /* ignore if table doesn't exist yet */ }
  }

  async function loadColors() {
    try {
      const data = await api<{ id: number; colour: string }[]>("/api/config/colors");
      setColors(data);
    } catch { /* ignore if table doesn't exist yet */ }
  }

  async function loadSvg() {
    try {
      const data = await api<{ svgCode: string }>("/api/config/svg");
      setSvgCode(data.svgCode);
    } catch { /* ignore if table doesn't exist yet */ }
  }

  useEffect(() => {
    if (!selectedMacro) return;
    setMacroName(selectedMacro.name);
    setMacroCode(selectedMacro.code);
  }, [selectedMacro]);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
      throw new Error(payload?.error ?? `Request failed: ${response.status}`);
    }

    return payload as T;
  }

  async function refreshMacros() {
    try {
      const next = await api<Macro[]>("/api/macros");
      setMacros(next);
      if (!selectedMacroId && next[0]) {
        setSelectedMacroId(next[0].id);
      }
    } catch (nextError) {
      showError(nextError);
    }
  }

  async function withRequest(action: () => Promise<void>) {
    setRequestState("busy");
    setError("");
    setStatus("");
    try {
      await action();
    } catch (nextError) {
      showError(nextError);
    } finally {
      setRequestState("idle");
    }
  }

  function showError(nextError: unknown) {
    setError(nextError instanceof Error ? nextError.message : "操作失败");
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    await withRequest(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api<WorkbookUploadResponse>("/api/workbook/upload", {
        method: "POST",
        body: formData
      });

      const nextWorkbook = {
        workbookId: result.workbookId,
        sheetNames: result.sheetNames,
        preview: result.preview
      };
      setWorkbook(nextWorkbook);
      setSelectedSheet(result.preview.sheetName);
      setRunResult(null);
      setImportResult(null);
      setStatus(`已上传：${file.name}`);
    });
  }

  async function handleCreateMacro() {
    await withRequest(async () => {
      const macro = await api<Macro>("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新宏" })
      });
      setMacros((current) => [macro, ...current]);
      setSelectedMacroId(macro.id);
      setStatus("宏已新增");
    });
  }

  async function handleSaveMacro() {
    if (!selectedMacroId) return;
    await withRequest(async () => {
      const macro = await api<Macro>(`/api/macros/${selectedMacroId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: macroName, code: macroCode })
      });
      setMacros((current) => current.map((item) => (item.id === macro.id ? macro : item)));
      setMacroCode(macro.code);
      setStatus(macro.code === macroCode ? "宏已保存" : "宏已保存并完成 WPS/Excel 写法转译");
    });
  }

  async function handleTranslateMacro() {
    await withRequest(async () => {
      const result = await api<{ code: string; changed: boolean }>("/api/macros/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: macroCode })
      });
      setMacroCode(result.code);
      setStatus(result.changed ? "已转译为兼容写法" : "当前宏无需转译");
    });
  }

  async function handleDeleteMacro() {
    if (!selectedMacroId) return;
    await withRequest(async () => {
      await api<{ ok: true }>(`/api/macros/${selectedMacroId}`, { method: "DELETE" });
      const next = await api<Macro[]>("/api/macros");
      setMacros(next);
      setSelectedMacroId(next[0]?.id ?? "");
      setStatus("宏已删除");
    });
  }

  async function handleMoveMacro(id: string, direction: -1 | 1) {
    const currentIndex = macros.findIndex((macro) => macro.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= macros.length) return;

    const next = [...macros];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, moved);
    setMacros(next);

    try {
      const saved = await api<Macro[]>("/api/macros/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map((macro) => macro.id) })
      });
      setMacros(saved);
      setStatus("宏顺序已更新");
      setError("");
    } catch (nextError) {
      setMacros(macros);
      showError(nextError);
    }
  }

  async function handleRunMacro() {
    if (!workbook) {
      setError("请先上传 Excel 文件");
      return;
    }

    await withRequest(async () => {
      const result = await api<MacroRunResponse>(`/api/workbook/${workbook.workbookId}/run-macro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: macroCode, sheetName: selectedSheet })
      });
      setRunResult(result);
      setWorkbook({ ...workbook, preview: result.preview });
      setStatus(`运行完成，修改 ${result.stats.modifiedCells} 个单元格`);
    });
  }

  async function handleRunAllMacros() {
    if (!workbook) {
      setError("请先上传 Excel 文件");
      return;
    }
    if (macros.length === 0) {
      setError("请先新增宏");
      return;
    }

    await withRequest(async () => {
      const result = await api<MacroRunResponse>(`/api/workbook/${workbook.workbookId}/run-all-macros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          macros: macros.map((macro) => ({
            id: macro.id,
            name: macro.name,
            code: macro.id === selectedMacroId ? macroCode : macro.code
          })),
          sheetName: selectedSheet
        })
      });
      setRunResult(result);
      setWorkbook({ ...workbook, preview: result.preview });
      setStatus(`全部宏运行完成，共修改 ${result.stats.modifiedCells} 个单元格`);
    });
  }

  async function handleImportDb() {
    if (!workbook) {
      setError("请先上传并处理 Excel 文件");
      return;
    }

    await withRequest(async () => {
      const result = await api<ImportDbResponse>(`/api/workbook/${workbook.workbookId}/import-db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName,
          sheetName: selectedSheet,
          headerRow,
          mode: "overwrite"
        })
      });
      setImportResult(result);
      setStatus(`已覆盖写入 MySQL：${result.insertedRows} 行`);
    });
  }

  async function handleSaveTitle() {
    await withRequest(async () => {
      await api("/api/config/title", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: titleValue })
      });
      setStatus("标题已保存");
    });
  }

  async function handleSaveSvg() {
    await withRequest(async () => {
      await api("/api/config/svg", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svgCode })
      });
      setStatus("SVG已保存");
    });
  }

  async function handleSaveColor(id: number, colour: string) {
    await withRequest(async () => {
      await api("/api/config/colors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, colour })
      });
      setColors((prev) => prev.map((c) => (c.id === id ? { ...c, colour } : c)));
      setStatus("色值已保存");
    });
  }

  async function handleAddColor() {
    await withRequest(async () => {
      const result = await api<{ id: number; colour: string }>("/api/config/colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colour: "#888888" })
      });
      setColors((prev) => [...prev, result]);
      setStatus("已添加色值");
    });
  }

  async function handleDeleteColor(id: number) {
    await withRequest(async () => {
      await api(`/api/config/colors/${id}`, { method: "DELETE" });
      setColors((prev) => prev.filter((c) => c.id !== id));
      setStatus("已删除色值");
    });
  }

  function handleDownload() {
    if (!workbook) return;
    window.location.href = `/api/workbook/${workbook.workbookId}/download`;
  }

  async function handleEditPreviewCell(row: number, column: number, value: string) {
    if (!workbook) return;
    await withRequest(async () => {
      const result = await api<{ preview: WorkbookPreview }>(`/api/workbook/${workbook.workbookId}/cell`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: selectedSheet,
          row,
          column,
          value
        })
      });
      setWorkbook({ ...workbook, preview: result.preview });
      setStatus(`已更新 R${row}C${column}`);
    });
  }

  async function handleDeletePreviewRow(row: number) {
    if (!workbook) return;
    await withRequest(async () => {
      const sheet = selectedSheet ? `&sheet=${encodeURIComponent(selectedSheet)}` : "";
      const result = await api<{ preview: WorkbookPreview }>(
        `/api/workbook/${workbook.workbookId}/row?row=${row}${sheet}`,
        { method: "DELETE" }
      );
      setWorkbook({ ...workbook, preview: result.preview });
      setStatus(`已删除第 ${row} 行`);
    });
  }

  async function handleDeletePreviewColumn(column: number) {
    if (!workbook) return;
    await withRequest(async () => {
      const sheet = selectedSheet ? `&sheet=${encodeURIComponent(selectedSheet)}` : "";
      const result = await api<{ preview: WorkbookPreview }>(
        `/api/workbook/${workbook.workbookId}/column?column=${column}${sheet}`,
        { method: "DELETE" }
      );
      setWorkbook({ ...workbook, preview: result.preview });
      setStatus(`已删除第 ${column} 列`);
    });
  }

  const preview = workbook?.preview;
  const busy = requestState === "busy";

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-ink">sheet-preprocessor</h1>
            <p className="mt-1 text-sm text-slate-600">Excel 宏预处理与数据库覆盖导入</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButton} onClick={() => fileInputRef.current?.click()} disabled={busy}>
              上传 Excel
            </button>
            <button className={primaryButton} onClick={handleRunMacro} disabled={busy || !workbook || !macroCode}>
              运行宏
            </button>
            <button className={secondaryButton} onClick={handleRunAllMacros} disabled={busy || !workbook || macros.length === 0}>
              运行全部宏
            </button>
            <button className={secondaryButton} onClick={handleDownload} disabled={!workbook}>
              下载 Excel
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            void handleUpload(file);
          }}
        />

        {(status || error) && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              error ? "border-red-200 bg-red-50 text-red-700" : "border-teal-200 bg-teal-50 text-teal-800"
            }`}
          >
            {error || status}
          </div>
        )}

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          <aside className="rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="flex items-center justify-between border-b border-slate-200 p-3">
              <h2 className="text-sm font-semibold text-slate-900">宏列表</h2>
              <button className={secondaryButton} onClick={handleCreateMacro} disabled={busy}>
                新增
              </button>
            </div>
            <div className="max-h-[680px] space-y-2 overflow-auto p-3">
              {macros.map((macro, index) => (
                <div
                  key={macro.id}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                    macro.id === selectedMacroId
                      ? "border-teal-500 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedMacroId(macro.id)}>
                    <span className="block truncate font-medium">{index + 1}. {macro.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {new Date(macro.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-35"
                      title="上移"
                      aria-label={`上移 ${macro.name}`}
                      disabled={busy || index === 0}
                      onClick={() => void handleMoveMacro(macro.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-35"
                      title="下移"
                      aria-label={`下移 ${macro.name}`}
                      disabled={busy || index === macros.length - 1}
                      onClick={() => void handleMoveMacro(macro.id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
              <input
                className={inputClass}
                value={macroName}
                onChange={(event) => setMacroName(event.target.value)}
                placeholder="宏名称"
              />
              <div className="flex gap-2">
                <button className={secondaryButton} onClick={handleSaveMacro} disabled={busy || !selectedMacroId}>
                  保存
                </button>
                <button className={secondaryButton} onClick={handleTranslateMacro} disabled={busy || !macroCode}>
                  转译
                </button>
                <button className={dangerButton} onClick={handleDeleteMacro} disabled={busy || !selectedMacroId}>
                  删除
                </button>
              </div>
            </div>
            <div className="h-[620px] min-h-[420px] overflow-hidden">
              <MonacoEditor
                height="100%"
                language="javascript"
                theme="vs"
                value={macroCode}
                onChange={(value) => setMacroCode(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2
                }}
              />
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">工作簿</h2>
              <div className="mt-3 space-y-3">
                <button
                  className="flex min-h-24 w-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600 transition hover:border-teal-500 hover:bg-teal-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  <span className="font-medium text-slate-800">选择 .xlsx 文件</span>
                  <span className="mt-1 text-xs text-slate-500">
                    {workbook ? `${workbook.sheetNames.length} 个 Sheet 已载入` : "本地开发存储"}
                  </span>
                </button>
                <label className="block text-xs font-medium uppercase tracking-normal text-slate-500">Sheet</label>
                <select
                  className={inputClass}
                  value={selectedSheet}
                  onChange={(event) => setSelectedSheet(event.target.value)}
                  disabled={!workbook}
                >
                  {workbook?.sheetNames.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))}
                </select>
                {runResult && (
                  <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                    <Stat label="修改" value={runResult.stats.modifiedCells} />
                    <Stat label="行" value={runResult.stats.usedRows} />
                    <Stat label="耗时" value={`${runResult.stats.durationMs}ms`} />
                  </dl>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">入库配置</h2>
              <div className="mt-3 space-y-3">
                <input
                  className={inputClass}
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                  placeholder="目标表名（如 全国授课动态）"
                />
                <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={headerRow}
                    onChange={(event) => setHeaderRow(event.target.checked)}
                  />
                  首行为表头
                </label>
                <button className={primaryButton + " w-full"} onClick={handleImportDb} disabled={busy || !workbook}>
                  覆盖入库
                </button>
                {importResult && (
                  <p className="text-xs leading-5 text-slate-600">
                    MySQL · {importResult.tableName}：
                    {importResult.insertedRows} 行，{importResult.columns.length} 列
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">标题设置</h2>
              <div className="mt-3 flex gap-2">
                <input
                  className={inputClass}
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  placeholder="day_qgskdt"
                />
                <button className={primaryButton} onClick={handleSaveTitle} disabled={busy}>
                  保存
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">色值管理</h2>
              <div className="mt-3 space-y-2">
                {colors.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-9 cursor-pointer rounded border border-slate-300"
                      value={c.colour}
                      onChange={(event) => handleSaveColor(c.id, event.target.value)}
                      disabled={busy}
                    />
                    <input
                      className={`${inputClass} flex-1`}
                      value={c.colour}
                      onChange={(event) => {
                        const next = event.target.value;
                        setColors((prev) => prev.map((x) => (x.id === c.id ? { ...x, colour: next } : x)));
                      }}
                      onBlur={(event) => handleSaveColor(c.id, event.target.value)}
                      disabled={busy}
                    />
                    <button
                      className="flex h-9 w-9 items-center justify-center rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30"
                      onClick={() => handleDeleteColor(c.id)}
                      disabled={busy}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button className={primaryButton + " w-full"} onClick={handleAddColor} disabled={busy}>
                  新增色值
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">SVG管理</h2>
              <div className="mt-3 space-y-3">
                <textarea
                  className={`${inputClass} h-32 resize-y font-mono text-xs`}
                  value={svgCode}
                  onChange={(event) => setSvgCode(event.target.value)}
                  placeholder="<svg>...</svg>"
                />
                <button className={primaryButton + " w-full"} onClick={handleSaveSvg} disabled={busy}>
                  保存SVG
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-panel">
              <h2 className="text-sm font-semibold text-slate-900">日志</h2>
              <pre className="mt-3 h-40 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                {(runResult?.logs.length ? runResult.logs : ["等待运行宏"]).join("\n")}
              </pre>
            </section>
          </aside>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-slate-200 p-3">
            <h2 className="text-sm font-semibold text-slate-900">预览</h2>
            {preview && (
              <span className="text-xs text-slate-500">
                {preview.sheetName} · {preview.rowCount} 行 · {preview.columnCount} 列
              </span>
            )}
          </div>
          <PreviewTable preview={preview} onEditCell={workbook ? handleEditPreviewCell : undefined} onDeleteRow={workbook ? handleDeletePreviewRow : undefined} onDeleteColumn={workbook ? handleDeletePreviewColumn : undefined} disabled={busy} />
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-100 px-2 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function PreviewTable({
  preview,
  onEditCell,
  onDeleteRow,
  onDeleteColumn,
  disabled
}: {
  preview?: WorkbookPreview;
  onEditCell?: (row: number, column: number, value: string) => Promise<void>;
  onDeleteRow?: (row: number) => Promise<void>;
  onDeleteColumn?: (column: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [deletingCol, setDeletingCol] = useState<number | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);

  if (!preview) {
    return <div className="p-8 text-center text-sm text-slate-500">尚未上传工作簿</div>;
  }

  if (preview.rows.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-500">当前 Sheet 没有可预览数据</div>;
  }

  async function delCol(col: number) {
    if (!onDeleteColumn || deletingCol) return;
    setDeletingCol(col);
    try {
      await onDeleteColumn(col);
    } finally {
      setDeletingCol(null);
    }
  }

  async function delRow(row: number) {
    if (!onDeleteRow || deletingRow) return;
    if (!confirm(`删除第 ${row} 行？`)) return;
    setDeletingRow(row);
    try {
      await onDeleteRow(row);
    } finally {
      setDeletingRow(null);
    }
  }

  const maxCols = Math.max(...preview.rows.map((r) => r.length), 0);
  const colHeaders = maxCols > 0 && preview.rows.length > 0 ? preview.rows[0].map((_, c) => (
    <th key={c} className="border-b border-r border-slate-200 bg-slate-100 px-2 py-1 text-center">
      <button
        className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-100 disabled:opacity-30"
        disabled={disabled || !onDeleteColumn || deletingCol === c + 1}
        onClick={() => delCol(c + 1)}
        title={`删除第 ${c + 1} 列`}
      >
        ✕
      </button>
    </th>
  )) : null;

  return (
    <div className="max-h-[480px] overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-1" />
            {colHeaders}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100" : "odd:bg-white even:bg-slate-50"}>
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-500">
                <button
                  className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-100 disabled:opacity-30"
                  disabled={disabled || !onDeleteRow || deletingRow === rowIndex + 1}
                  onClick={() => delRow(rowIndex + 1)}
                  title={`删除第 ${rowIndex + 1} 行`}
                >
                  ✕
                </button>
              </th>
              {row.map((cell, columnIndex) => (
                <td
                  key={`${rowIndex}-${columnIndex}`}
                  className="min-w-36 max-w-72 border-b border-r border-slate-200 p-0 text-slate-700"
                  title={cell === null ? "" : String(cell)}
                >
                  <EditablePreviewCell
                    value={cell === null ? "" : String(cell)}
                    row={rowIndex + 1}
                    column={columnIndex + 1}
                    disabled={disabled || !onEditCell}
                    onCommit={onEditCell}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditablePreviewCell({
  value,
  row,
  column,
  disabled,
  onCommit
}: {
  value: string;
  row: number;
  column: number;
  disabled?: boolean;
  onCommit?: (row: number, column: number, value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function commit() {
    if (!onCommit || disabled || draft === value) return;
    setSaving(true);
    try {
      await onCommit(row, column, draft);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      className={`h-9 w-full bg-transparent px-3 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-inset focus:ring-teal-400 ${
        saving ? "text-teal-700" : "text-slate-700"
      }`}
      value={draft}
      disabled={disabled || saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      aria-label={`R${row}C${column}`}
    />
  );
}
