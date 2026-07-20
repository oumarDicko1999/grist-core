import {
  parseIkaDocGuidedWorkspaceDescriptor,
  parseIkaDocGuidedWorkspaceMarker,
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
    });
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
