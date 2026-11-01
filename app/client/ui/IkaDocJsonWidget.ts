import { DataRowModel } from "app/client/models/DataRowModel";
import { FieldOptions } from "app/client/widgets/NewBaseEditor";
import { NTextBox } from "app/client/widgets/NTextBox";
import { NTextEditor } from "app/client/widgets/NTextEditor";
import { CellValue } from "app/common/DocActions";

import { dom } from "grainjs";

/** IkaDoc JSON metadata, stored as text: shown indented, never edited in Grist. */
export class IkaDocJsonTextBox extends NTextBox {
  public buildDom(row: DataRowModel) {
    const value = row.cells[this.field.colId.peek()];

    return dom(
      "div.field_clip",
      dom.style("text-align", this.alignment),
      dom.cls("text_wrapping", this.wrapping),
      dom.domComputed(use => use(row._isAddRow) || this.isDisposed() ? null : formatJsonCellValue(use(value))),
    );
  }
}

export class IkaDocJsonEditor extends NTextEditor {
  constructor(options: FieldOptions) {
    super({ ...options, readonly: true });
  }
}

/** Valid JSON is indented; anything else is shown as stored. */
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
