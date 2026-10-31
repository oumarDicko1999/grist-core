import {
  parseIkaDocGuidedWorkspaceDescriptor,
  parseIkaDocGuidedWorkspaceMarker,
  parseIkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";

import { assert } from "chai";

describe("IkaDocGuidedWorkspace", function() {
  it("parses backend-issued guided workspace markers", function() {
    assert.deepEqual(parseIkaDocGuidedWorkspaceMarker(guidedMarker()), {
      intent: "RECORD_IMPORT",
      targetCollectionCode: "records",
      targetSchemaType: "document",
      targetSchemaCode: "document_default",
      finalAction: "APPLY_TO_IKADOC",
      tableBindings: [],
    });
  });

  it("parses backend-issued guided workspace table bindings", function() {
    assert.deepEqual(
      parseIkaDocGuidedWorkspaceMarker({
        ...guidedMarker(),
        tableBindings: [
          { tableId: "document_default", targetSchemaCode: "document_default" },
          { tableId: "folder_case", targetSchemaCode: "folder_case" },
        ],
      }),
      {
        intent: "RECORD_IMPORT",
        targetCollectionCode: "records",
        targetSchemaType: "document",
        targetSchemaCode: "document_default",
        finalAction: "APPLY_TO_IKADOC",
        tableBindings: [
          { tableId: "document_default", targetSchemaCode: "document_default" },
          { tableId: "folder_case", targetSchemaCode: "folder_case" },
        ],
      },
    );
  });

  it("rejects malformed guided workspace table bindings", function() {
    assert.isUndefined(
      parseIkaDocGuidedWorkspaceMarker({
        ...guidedMarker(),
        tableBindings: [{ tableId: "document_default" }],
      }),
    );
  });

  it("preserves the complete backend field descriptor contract", function() {
    const descriptor = parseIkaDocGuidedWorkspaceDescriptor({
      marker: guidedMarker(),
      schemaType: { code: "document", label: "Document" },
      schema: {
        code: "document_default",
        fullCode: "document.document_default",
        label: "Document",
      },
      fields: [
        {
          code: "retentionRule",
          label: "Retention rule",
          columnLabel: "Retention rule (retentionRule)",
          kind: "json",
          editor: { kind: "json-retention-rule", valueShape: "object" },
          multiValue: false,
          required: true,
          readOnly: false,
          derived: false,
          sensitive: false,
          visibility: "visible",
          section: "governance",
          defaultValue: { delay: "P1Y" },
          reference: {
            referencedTypeCode: "retention_rule",
            allowedSchemaCodes: ["retention_rule_default"],
          },
          enumValues: ["short", "long"],
          json: {
            payloadClass: "RetentionRuleDelay",
            editorKind: "retention-rule-delay",
          },
        },
      ],
      protectedColumns: [
        {
          code: "ikadoc_row_key",
          label: "Row key",
          required: true,
          readOnly: true,
        },
      ],
    });

    assert.isDefined(descriptor);
    if (!descriptor) {
      return;
    }
    assert.deepEqual(descriptor.tables, []);
    assert.deepEqual(descriptor.fields[0], {
      code: "retentionRule",
      label: "Retention rule",
      columnLabel: "Retention rule (retentionRule)",
      kind: "json",
      editor: { kind: "json-retention-rule", valueShape: "object" },
      multiValue: false,
      required: true,
      readOnly: false,
      derived: false,
      sensitive: false,
      visibility: "visible",
      section: "governance",
      defaultValue: { delay: "P1Y" },
      reference: {
        referencedTypeCode: "retention_rule",
        allowedSchemaCodes: ["retention_rule_default"],
      },
      enumValues: ["short", "long"],
      json: {
        payloadClass: "RetentionRuleDelay",
        editorKind: "retention-rule-delay",
      },
    });
  });

  it("parses backend-issued guided workspace table descriptors", function() {
    const descriptor = parseIkaDocGuidedWorkspaceDescriptor({
      marker: {
        ...guidedMarker(),
        tableBindings: [
          { tableId: "folder_case", targetSchemaCode: "folder.case" },
        ],
      },
      schemaType: { code: "folder", label: "Folder" },
      schema: { code: "case", fullCode: "folder.case", label: "Case" },
      fields: [],
      protectedColumns: [],
      tables: [
        {
          tableId: "folder_case",
          targetSchemaCode: "folder.case",
          schema: { code: "case", fullCode: "folder.case", label: "Case" },
          fields: [guidedTitleField()],
          protectedColumns: [
            {
              code: "ikadoc_row_key",
              label: "Row key",
              required: true,
              readOnly: true,
            },
          ],
        },
      ],
    });

    assert.isDefined(descriptor);
    if (!descriptor) {
      return;
    }
    assert.equal(descriptor.tables[0].tableId, "folder_case");
    assert.equal(descriptor.tables[0].targetSchemaCode, "folder.case");
    assert.deepEqual(descriptor.tables[0].schema, {
      code: "case",
      fullCode: "folder.case",
      label: "Case",
    });
    assert.equal(descriptor.tables[0].fields[0].code, "title");
    assert.deepEqual(descriptor.tables[0].protectedColumns, [
      {
        code: "ikadoc_row_key",
        label: "Row key",
        required: true,
        readOnly: true,
      },
    ]);
  });

  it("preserves schema context on guided workspace cell conflicts", function() {
    const result = parseIkaDocGuidedWorkspaceResult({
      success: false,
      simulated: true,
      importedCounts: {},
      updatedCounts: {},
      errors: [],
      warnings: [],
      conflicts: [
        {
          rowKey: "row-1",
          targetRecordId: "record-1",
          metadataCode: "title",
          valuesRedacted: false,
          tableId: "folder_case",
          targetSchemaCode: "folder.case",
          gristRowId: 3,
        },
      ],
    });

    assert.isDefined(result);
    if (!result) {
      return;
    }
    assert.equal(result.conflicts[0].targetSchemaCode, "folder.case");
  });

  it("rejects malformed guided workspace table descriptors", function() {
    assert.isUndefined(
      parseIkaDocGuidedWorkspaceDescriptor({
        marker: guidedMarker(),
        schemaType: { code: "folder", label: "Folder" },
        schema: { code: "case", fullCode: "folder.case", label: "Case" },
        fields: [],
        protectedColumns: [],
        tables: [
          {
            tableId: "folder_case",
            targetSchemaCode: "folder.case",
            schema: { code: "case", fullCode: "folder.case", label: "Case" },
            fields: [{ code: "title" }],
            protectedColumns: [],
          },
        ],
      }),
    );
  });

  it("rejects malformed nested descriptor metadata", function() {
    assert.isUndefined(
      parseIkaDocGuidedWorkspaceDescriptor({
        marker: guidedMarker(),
        schemaType: { code: "document", label: "Document" },
        schema: {
          code: "document_default",
          fullCode: "document.document_default",
          label: "Document",
        },
        fields: [
          {
            code: "title",
            label: "Title",
            columnLabel: "Title (title)",
            kind: "string",
            editor: { kind: "text-input", valueShape: "scalar" },
            multiValue: false,
            required: true,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "visible",
            reference: {
              referencedTypeCode: "document",
              allowedSchemaCodes: ["document_default", 42],
            },
            enumValues: [],
          },
        ],
        protectedColumns: [],
      }),
    );
  });

  it("parses guided workspace result details", function() {
    assert.deepEqual(
      parseIkaDocGuidedWorkspaceResult({
        success: false,
        simulated: true,
        importedCounts: { folder: 2 },
        updatedCounts: { document: 1 },
        errors: [
          {
            severity: "ERROR",
            schemaType: "folder",
            recordId: "row-key-1",
            rowKey: "row-key-1",
            row: 3,
            tableId: "Records",
            gristRowId: 12,
            column: "title",
            metadataCode: "title",
            value: "",
            message: "Title is required",
            suggestions: ["Fill the title"],
          },
        ],
        warnings: [
          {
            schemaType: "document",
            row: 4,
            column: "owner",
            message: "Owner will be inferred",
          },
        ],
        conflicts: [
          {
            rowKey: "row-key-1",
            targetRecordId: "00000000-0000-4000-8000-000000000701",
            metadataCode: "title",
            originalValue: "Original",
            proposedValue: "Mine",
            currentValue: "Server",
            valuesRedacted: false,
            tableId: "Records",
            targetSchemaCode: null,
            gristRowId: 12,
          },
        ],
      }),
      {
        success: false,
        simulated: true,
        importedCounts: { folder: 2 },
        updatedCounts: { document: 1 },
        errors: [
          {
            schemaType: "folder",
            message: "Title is required",
            severity: "ERROR",
            recordId: "row-key-1",
            rowKey: "row-key-1",
            row: 3,
            tableId: "Records",
            gristRowId: 12,
            column: "title",
            metadataCode: "title",
            value: "",
            suggestions: ["Fill the title"],
          },
        ],
        warnings: [
          {
            schemaType: "document",
            message: "Owner will be inferred",
            severity: null,
            recordId: null,
            rowKey: null,
            row: 4,
            tableId: null,
            gristRowId: null,
            column: "owner",
            metadataCode: null,
            value: null,
            suggestions: null,
          },
        ],
        conflicts: [
          {
            rowKey: "row-key-1",
            targetRecordId: "00000000-0000-4000-8000-000000000701",
            metadataCode: "title",
            originalValue: "Original",
            proposedValue: "Mine",
            currentValue: "Server",
            valuesRedacted: false,
            tableId: "Records",
            targetSchemaCode: null,
            gristRowId: 12,
          },
        ],
      },
    );
  });

  it("rejects malformed guided workspace result details", function() {
    assert.isUndefined(
      parseIkaDocGuidedWorkspaceResult({
        success: true,
        simulated: true,
        importedCounts: { folder: -1 },
        updatedCounts: {},
        errors: [],
        warnings: [],
        conflicts: [],
      }),
    );
    assert.isUndefined(
      parseIkaDocGuidedWorkspaceResult({
        success: true,
        simulated: true,
        importedCounts: {},
        updatedCounts: {},
        errors: [{ schemaType: "folder", message: "Broken", row: 0 }],
        warnings: [],
      }),
    );
  });
});

function guidedMarker() {
  return {
    intent: "RECORD_IMPORT",
    targetCollectionCode: "records",
    targetSchemaType: "document",
    targetSchemaCode: "document_default",
    finalAction: "APPLY_TO_IKADOC",
  };
}

function guidedTitleField() {
  return {
    code: "title",
    label: "Title",
    columnLabel: "Title (title)",
    kind: "string",
    editor: { kind: "text-input", valueShape: "scalar" },
    multiValue: false,
    required: true,
    readOnly: false,
    derived: false,
    sensitive: false,
    visibility: "visible",
    enumValues: [],
  };
}
