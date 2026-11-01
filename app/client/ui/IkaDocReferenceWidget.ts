import { ACResults, buildHighlightedDom, HighlightFunc, normalizeText } from "app/client/lib/ACIndex";
import { Autocomplete } from "app/client/lib/autocomplete";
import { makeT } from "app/client/lib/localization";
import { DataRowModel } from "app/client/models/DataRowModel";
import { reportError } from "app/client/models/errors";
import { ikaDocReferenceLabel, IkaDocReferenceLookupContext } from "app/client/ui/IkaDocReferenceLabels";
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

import { dom, Observable, styled } from "grainjs";

const t = makeT("IkaDocReferenceWidget");

/** Guided rows carry IkaDoc's key for the row; IkaDoc scopes some references by it. */
const GUIDED_ROW_KEY_COLUMN = "ikadoc_row_key";
const LOOKUP_PAGE_SIZE = 20;

interface ReferenceItem {
  id: string;
  text: string;
  hint: string;
  cleanText: string;
}

/**
 * An IkaDoc reference cell: stores the referenced record's id and shows its label. The lookup
 * goes through IkaDoc, which only offers records the session may reference.
 */
export class IkaDocReferenceTextBox extends NTextBox {
  public buildDom(row: DataRowModel) {
    const value = row.cells[this.field.colId.peek()];

    const shownId = Observable.create<string>(null, "");
    const label = Observable.create<string>(null, "");

    return dom(
      "div.field_clip",
      dom.autoDispose(shownId),
      dom.autoDispose(label),
      dom.style("text-align", this.alignment),
      dom.cls("text_wrapping", this.wrapping),
      dom.domComputed((use) => {
        if (use(row._isAddRow) || this.isDisposed()) {
          return null;
        }

        const id = String(use(value) ?? "").trim();

        // The id shows until IkaDoc answers with its label.
        if (use(shownId) !== id) {
          shownId.set(id);
          label.set(id);

          if (id) {
            this._resolveLabel(row, id, label).catch(reportError);
          }
        }

        return use(label);
      }),
    );
  }

  private async _resolveLabel(row: DataRowModel, id: string, label: Observable<string>): Promise<void> {
    const config = getIkaDocRuntimeConfig();
    const rowKey = rowKeyValue(row.cells[GUIDED_ROW_KEY_COLUMN]?.peek());
    const context = lookupContext(this.field.tableId.peek(), this.field.widgetOptionsJson.peek(), rowKey);
    if (!config || !context) {
      return;
    }

    const resolved = await ikaDocReferenceLabel(config, context, id);
    if (!this.isDisposed()) {
      label.set(resolved);
    }
  }
}

/** Edits an IkaDoc reference by searching IkaDoc's records by label; saves the chosen id. */
export class IkaDocReferenceEditor extends NTextEditor {
  private _autocomplete?: Autocomplete<ReferenceItem>;
  private _original?: ReferenceItem;
  private _selected?: ReferenceItem;

  constructor(options: FieldOptions) {
    super(options);

    if (!options.readonly) {
      this.cellEditorDiv.classList.add(cssReferenceEditor.className);
    }

    this._showOriginalLabel().catch(reportError);
  }

  public attach(cellElem: Element): void {
    super.attach(cellElem);
    if (this.options.readonly) {
      return;
    }

    this._autocomplete = this.autoDispose(new Autocomplete<ReferenceItem>(this.textInput, {
      menuCssClass: `${menuCssClass} ${cssReferenceList.className}`,
      buildNoItemsMessage: () => cssReferenceMessage(t("No matching references")),
      search: this._search.bind(this),
      renderItem: renderReferenceItem,
      getItemText: item => item.text,
      onClick: () => {
        this._selected = this._autocomplete?.getSelectedItem();
        this.options.commands.fieldEditSaveHere();
      },
    }));
  }

  public getCellValue(): CellValue {
    const selected = this._selected ?? this._autocomplete?.getSelectedItem();
    if (selected) {
      return selected.id;
    }

    // The label shown for the current id, left as is, keeps that id.
    if (this._original && this.textInput.value === this._original.text) {
      return this.options.cellValue;
    }

    return super.getCellValue();
  }

  /** The editor opens on the stored id; it is replaced by its label once IkaDoc gives it. */
  private async _showOriginalLabel(): Promise<void> {
    const id = String(this.options.cellValue ?? "").trim();
    const config = getIkaDocRuntimeConfig();
    const context = this._lookupContext();
    if (!id || !config || !context) {
      return;
    }

    const [option] = await resolveIkaDocGuidedReferenceOptions(config, { ...context, ids: [id] });
    if (!option || this.isDisposed()) {
      return;
    }

    this._original = toReferenceItem(option);

    if (this.textInput.value === id) {
      this.textInput.value = this._original.text;
      this.resizeInput();
    }
  }

  private async _search(text: string): Promise<ACResults<ReferenceItem>> {
    const config = getIkaDocRuntimeConfig();
    const context = this._lookupContext();
    if (!config || !context) {
      return { items: [], extraItems: [], highlightFunc: value => [value], selectIndex: -1 };
    }

    const options = await searchIkaDocGuidedReferenceOptions(config, {
      ...context,
      query: text,
      pageSize: LOOKUP_PAGE_SIZE,
    });

    return {
      items: options.map(toReferenceItem),
      extraItems: [],
      highlightFunc: highlightMatch(text),
      selectIndex: options.length > 0 ? 0 : -1,
    };
  }

  private _lookupContext(): IkaDocReferenceLookupContext | undefined {
    const { field, gristDoc, rowId } = this.options;
    const tableId = field.tableId.peek();

    const rowKey = rowKeyValue(gristDoc.docData.getTable(tableId)?.getValue(rowId, GUIDED_ROW_KEY_COLUMN));

    return lookupContext(tableId, field.widgetOptionsJson.peek(), rowKey);
  }
}

/** The lookup context of a reference column; undefined when it names no IkaDoc metadata. */
function lookupContext(
  tableId: string,
  widgetOptions: Record<string, unknown>,
  rowKey: string | undefined,
): IkaDocReferenceLookupContext | undefined {
  const metadataCode = widgetOptions.metadataCode;
  if (!tableId || typeof metadataCode !== "string" || !metadataCode) {
    return undefined;
  }

  return rowKey ? { tableId, metadataCode, rowKey } : { tableId, metadataCode };
}

function rowKeyValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toReferenceItem(option: IkaDocReferenceLookupOption): ReferenceItem {
  const hint = [option.secondaryLabel, option.contextLabel].filter(Boolean).join(" - ");

  return {
    id: option.id,
    text: option.label,
    hint,
    cleanText: normalizeText(`${option.label} ${hint}`),
  };
}

function renderReferenceItem(item: ReferenceItem, highlightFunc: HighlightFunc): HTMLElement {
  return cssReferenceItem(
    cssReferenceLabel(buildHighlightedDom(item.text, highlightFunc, cssReferenceMatch)),
    item.hint ? cssReferenceHint(item.hint) : null,
  );
}

/** Highlights the first match of [searchText], ignoring case and accents. */
function highlightMatch(searchText: string): HighlightFunc {
  const normalized = normalizeText(searchText);

  return (text) => {
    const index = normalized ? normalizeText(text).indexOf(normalized) : -1;
    if (index < 0) {
      return [text];
    }

    const end = index + searchText.length;
    return [text.slice(0, index), text.slice(index, end), text.slice(end)];
  };
}

const cssReferenceEditor = styled("div", `
  & > .celleditor_text_editor, & > .celleditor_content_measure {
    padding-left: 8px;
  }
`);

const cssReferenceList = styled("div", `
  z-index: 1001;
  overflow-y: auto;
  padding: 4px 0;
`);

const cssReferenceItem = styled("li", `
  display: block;
  padding: 8px 12px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`);

const cssReferenceLabel = styled("div", `
  overflow: hidden;
  text-overflow: ellipsis;
`);

const cssReferenceHint = styled("div", `
  opacity: 0.72;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
`);

const cssReferenceMatch = styled("span", `
  font-weight: 600;
`);

const cssReferenceMessage = styled("div", `
  padding: 8px 12px;
  opacity: 0.72;
`);
