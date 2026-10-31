import {
  ACResults,
  buildHighlightedDom,
  HighlightFunc,
  normalizeText,
} from "app/client/lib/ACIndex";
import { Autocomplete } from "app/client/lib/autocomplete";
import { makeT } from "app/client/lib/localization";
import { DataRowModel } from "app/client/models/DataRowModel";
import { reportError } from "app/client/models/errors";
import { getIkaDocRuntimeConfig } from "app/client/ui/IkaDocRuntimeAccess";
import { menuCssClass } from "app/client/ui2018/menus";
import { FieldOptions } from "app/client/widgets/NewBaseEditor";
import { NTextBox } from "app/client/widgets/NTextBox";
import { NTextEditor } from "app/client/widgets/NTextEditor";
import { CellValue } from "app/common/DocActions";
import {
  IkaDocReferenceLookupOption,
  resolveIkaDocGuidedReferenceOptions,
  searchIkaDocGuidedReferenceOptions,
} from "app/ikadoc/IkaDocReferenceLookup";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { dom, Observable, styled } from "grainjs";

const GUIDED_ROW_KEY_COLUMN = "ikadoc_row_key";
const GUIDED_REFERENCE_LOOKUP_PAGE_SIZE = 20;
const MAX_REFERENCE_LABEL_CACHE_SIZE = 2000;
const t = makeT("IkaDocReferenceWidget");

const referenceLabelCache = new Map<string, string>();
const referenceLabelBatches = new Map<string, IkaDocReferenceResolveBatch>();

interface IkaDocReferenceAutocompleteItem {
  id: string;
  text: string;
  hint: string;
  cleanText: string;
}

interface IkaDocReferenceLookupContext {
  tableId: string;
  metadataCode: string;
  rowKey?: string;
}

interface IkaDocReferenceResolveBatch {
  config: IkaDocRuntimeConfig;
  request: IkaDocReferenceLookupContext;
  ids: Set<string>;
  waiters: Map<
    string,
    {
      resolve: (label: string) => void;
      reject: (error: unknown) => void;
    }[]
  >;
  scheduled: boolean;
}

export class IkaDocReferenceTextBox extends NTextBox {
  public buildDom(row: DataRowModel) {
    const value = row.cells[this.field.colId.peek()];
    const resolvedLabel = Observable.create<string>(null, "");
    const resolvedId = Observable.create<string>(null, "");
    return dom(
      "div.field_clip",
      dom.style("text-align", this.alignment),
      dom.cls("text_wrapping", this.wrapping),
      dom.domComputed((use) => {
        if (use(row._isAddRow) || this.isDisposed()) {
          return null;
        }
        const id = String(use(value) ?? "").trim();
        if (!id) {
          resolvedId.set("");
          resolvedLabel.set("");
          return "";
        }
        if (use(resolvedId) !== id) {
          resolvedId.set(id);
          resolvedLabel.set(id);
          this._resolveLabel(row, id, resolvedLabel).catch(reportError);
        }
        return use(resolvedLabel);
      }),
    );
  }

  private async _resolveLabel(
    row: DataRowModel,
    id: string,
    resolvedLabel: Observable<string>,
  ): Promise<void> {
    const config = getIkaDocRuntimeConfig();
    const request = lookupRequest(
      this.field.tableId.peek(),
      this.field.widgetOptionsJson.peek(),
      row,
    );
    if (!config || !request) {
      return;
    }
    const label = await cachedReferenceLabel(config, request, id);
    if (!this.isDisposed()) {
      resolvedLabel.set(label);
    }
  }
}

export class IkaDocReferenceEditor extends NTextEditor {
  private _autocomplete?: Autocomplete<IkaDocReferenceAutocompleteItem>;
  private _resolvedOriginal?: IkaDocReferenceAutocompleteItem;
  private _selected?: IkaDocReferenceAutocompleteItem;

  constructor(options: FieldOptions) {
    super(options);
    if (!options.readonly) {
      this.cellEditorDiv.classList.add(cssIkaDocReferenceEditor.className);
    }
    this._resolveInitialValue().catch(reportError);
  }

  public attach(cellElem: Element): void {
    super.attach(cellElem);
    if (this.options.readonly) {
      return;
    }
    this._autocomplete = this.autoDispose(
      new Autocomplete<IkaDocReferenceAutocompleteItem>(this.textInput, {
        menuCssClass: `${menuCssClass} ${cssIkaDocReferenceList.className}`,
        buildNoItemsMessage: () =>
          cssIkaDocReferenceMessage(t("No matching references")),
        search: this._search.bind(this),
        renderItem: this._renderItem.bind(this),
        getItemText: item => item.text,
        onClick: () => {
          this._selected = this._autocomplete?.getSelectedItem();
          this.options.commands.fieldEditSaveHere();
        },
      }),
    );
  }

  public getCellValue(): CellValue {
    const selected = this._selected ?? this._autocomplete?.getSelectedItem();
    if (selected) {
      return selected.id;
    }
    if (
      this._resolvedOriginal &&
      this.textInput.value === this._resolvedOriginal.text
    ) {
      return this.options.cellValue;
    }
    return super.getCellValue();
  }

  private async _resolveInitialValue(): Promise<void> {
    const id = String(this.options.cellValue ?? "").trim();
    if (!id) {
      return;
    }
    const config = getIkaDocRuntimeConfig();
    const request = this._lookupRequest();
    if (!config || !request) {
      return;
    }
    const options = await resolveIkaDocGuidedReferenceOptions(config, {
      tableId: request.tableId,
      metadataCode: request.metadataCode,
      rowKey: request.rowKey,
      ids: [id],
    });
    const option = options[0];
    if (!option || this.isDisposed()) {
      return;
    }
    this._resolvedOriginal = toAutocompleteItem(option);
    if (this.textInput.value === id) {
      this.textInput.value = this._resolvedOriginal.text;
      this.resizeInput();
    }
  }

  private async _search(
    text: string,
  ): Promise<ACResults<IkaDocReferenceAutocompleteItem>> {
    const config = getIkaDocRuntimeConfig();
    const request = this._lookupRequest();
    if (!config || !request) {
      return emptyResults();
    }
    const options = await searchIkaDocGuidedReferenceOptions(config, {
      ...request,
      query: text,
      pageSize: GUIDED_REFERENCE_LOOKUP_PAGE_SIZE,
    });
    return {
      items: options.map(toAutocompleteItem),
      extraItems: [],
      highlightFunc: highlightText(text),
      selectIndex: options.length > 0 ? 0 : -1,
    };
  }

  private _renderItem(
    item: IkaDocReferenceAutocompleteItem,
    highlightFunc: HighlightFunc,
  ): HTMLElement {
    return cssIkaDocReferenceItem(
      cssIkaDocReferenceLabel(
        buildHighlightedDom(item.text, highlightFunc, cssIkaDocReferenceMatch),
      ),
      dom.maybe(item.hint.length > 0, () => cssIkaDocReferenceHint(item.hint)),
    );
  }

  private _lookupRequest(): IkaDocReferenceLookupContext | undefined {
    const request = lookupRequest(
      this.options.field.tableId.peek(),
      this.options.field.widgetOptionsJson.peek(),
      undefined,
      this.options,
    );
    if (!request) {
      return undefined;
    }
    return request;
  }
}

export class IkaDocJsonTextBox extends NTextBox {
  public buildDom(row: DataRowModel) {
    const value = row.cells[this.field.colId.peek()];
    return dom(
      "div.field_clip",
      dom.style("text-align", this.alignment),
      dom.cls("text_wrapping", this.wrapping),
      dom.domComputed((use) => {
        if (use(row._isAddRow) || this.isDisposed()) {
          return null;
        }
        return formatJsonCellValue(use(value));
      }),
    );
  }
}

export class IkaDocJsonEditor extends NTextEditor {
  constructor(options: FieldOptions) {
    super({ ...options, readonly: true });
  }
}

function lookupRequest(
  tableId: string,
  options: Record<string, unknown>,
  row?: DataRowModel,
  fieldOptions?: FieldOptions,
): IkaDocReferenceLookupContext | undefined {
  const metadataCode =
    typeof options.metadataCode === "string" ? options.metadataCode : "";
  if (!tableId || !metadataCode) {
    return undefined;
  }
  const rowKey = row ?
    readRowKeyFromRow(row) :
    readRowKeyFromFieldOptions(fieldOptions, tableId);
  return rowKey ? { tableId, metadataCode, rowKey } : { tableId, metadataCode };
}

async function cachedReferenceLabel(
  config: IkaDocRuntimeConfig,
  request: IkaDocReferenceLookupContext,
  id: string,
): Promise<string> {
  const cacheKey = referenceLabelCacheKey(config, request, id);
  const cached = referenceLabelCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  return queueReferenceLabelResolve(config, request, id);
}

function queueReferenceLabelResolve(
  config: IkaDocRuntimeConfig,
  request: IkaDocReferenceLookupContext,
  id: string,
): Promise<string> {
  const batchKey = referenceLookupContextKey(config, request);
  let batch = referenceLabelBatches.get(batchKey);
  if (!batch) {
    batch = {
      config,
      request,
      ids: new Set<string>(),
      waiters: new Map<
        string,
        {
          resolve: (label: string) => void;
          reject: (error: unknown) => void;
        }[]
      >(),
      scheduled: false,
    };
    referenceLabelBatches.set(batchKey, batch);
  }
  batch.ids.add(id);
  const pending = new Promise<string>((resolve, reject) => {
    const waiters = batch.waiters.get(id) ?? [];
    waiters.push({ resolve, reject });
    batch.waiters.set(id, waiters);
  });
  if (!batch.scheduled) {
    batch.scheduled = true;
    window.setTimeout(() => flushReferenceLabelBatch(batchKey), 0);
  }
  return pending;
}

async function flushReferenceLabelBatch(batchKey: string): Promise<void> {
  const batch = referenceLabelBatches.get(batchKey);
  if (!batch) {
    return;
  }
  referenceLabelBatches.delete(batchKey);
  const ids = [...batch.ids];
  try {
    const options = await resolveIkaDocGuidedReferenceOptions(batch.config, {
      ...batch.request,
      ids,
    });
    const labels = new Map(options.map(option => [option.id, option.label]));
    for (const id of ids) {
      const label = labels.get(id) ?? id;
      rememberReferenceLabel(
        referenceLabelCacheKey(batch.config, batch.request, id),
        label,
      );
      resolveReferenceWaiters(batch, id, label);
    }
  } catch (error) {
    for (const id of ids) {
      rejectReferenceWaiters(batch, id, error);
    }
  }
}

function rememberReferenceLabel(cacheKey: string, label: string): void {
  referenceLabelCache.set(cacheKey, label);
  if (referenceLabelCache.size <= MAX_REFERENCE_LABEL_CACHE_SIZE) {
    return;
  }
  const oldestKey = referenceLabelCache.keys().next().value;
  if (oldestKey) {
    referenceLabelCache.delete(oldestKey);
  }
}

function resolveReferenceWaiters(
  batch: IkaDocReferenceResolveBatch,
  id: string,
  label: string,
): void {
  for (const waiter of batch.waiters.get(id) ?? []) {
    waiter.resolve(label);
  }
}

function rejectReferenceWaiters(
  batch: IkaDocReferenceResolveBatch,
  id: string,
  error: unknown,
): void {
  for (const waiter of batch.waiters.get(id) ?? []) {
    waiter.reject(error);
  }
}

function referenceLookupContextKey(
  config: IkaDocRuntimeConfig,
  request: IkaDocReferenceLookupContext,
): string {
  return [
    config.sessionId,
    request.tableId,
    request.metadataCode,
    request.rowKey ?? "",
  ].join("|");
}

function referenceLabelCacheKey(
  config: IkaDocRuntimeConfig,
  request: IkaDocReferenceLookupContext,
  id: string,
): string {
  return [referenceLookupContextKey(config, request), id].join("|");
}

function readRowKeyFromRow(row: DataRowModel): string | undefined {
  const value = row.cells[GUIDED_ROW_KEY_COLUMN]?.peek();
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRowKeyFromFieldOptions(
  options: FieldOptions | undefined,
  tableId: string,
): string | undefined {
  if (!options) {
    return undefined;
  }
  const value = options.gristDoc.docData
    .getTable(tableId)
    ?.getValue(options.rowId, GUIDED_ROW_KEY_COLUMN);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatJsonCellValue(value: CellValue): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value !== "string") {
    return String(value);
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function toAutocompleteItem(
  option: IkaDocReferenceLookupOption,
): IkaDocReferenceAutocompleteItem {
  const hint = [option.secondaryLabel, option.contextLabel]
    .filter(Boolean)
    .join(" - ");
  return {
    id: option.id,
    text: option.label,
    hint,
    cleanText: normalizeText(`${option.label} ${hint}`),
  };
}

function emptyResults(): ACResults<IkaDocReferenceAutocompleteItem> {
  return {
    items: [],
    extraItems: [],
    highlightFunc: text => [text],
    selectIndex: -1,
  };
}

function highlightText(searchText: string): HighlightFunc {
  const normalized = normalizeText(searchText);
  if (!normalized) {
    return text => [text];
  }
  return (text) => {
    const index = normalizeText(text).indexOf(normalized);
    if (index < 0) {
      return [text];
    }
    return [
      text.slice(0, index),
      text.slice(index, index + searchText.length),
      text.slice(index + searchText.length),
    ];
  };
}

const cssIkaDocReferenceEditor = styled(
  "div",
  `
  & > .celleditor_text_editor, & > .celleditor_content_measure {
    padding-left: 8px;
  }
`,
);

const cssIkaDocReferenceList = styled(
  "div",
  `
  z-index: 1001;
  overflow-y: auto;
  padding: 4px 0;
`,
);

const cssIkaDocReferenceItem = styled(
  "li",
  `
  display: block;
  padding: 8px 12px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`,
);

const cssIkaDocReferenceLabel = styled(
  "div",
  `
  overflow: hidden;
  text-overflow: ellipsis;
`,
);

const cssIkaDocReferenceHint = styled(
  "div",
  `
  opacity: 0.72;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
`,
);

const cssIkaDocReferenceMatch = styled(
  "span",
  `
  font-weight: 600;
`,
);

const cssIkaDocReferenceMessage = styled(
  "div",
  `
  padding: 8px 12px;
  opacity: 0.72;
`,
);
