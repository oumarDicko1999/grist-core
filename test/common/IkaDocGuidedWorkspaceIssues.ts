import "test/client/_helpers/setupI18n";

import {
  getIkaDocGuidedWorkspaceCellIssue,
  setIkaDocGuidedWorkspaceIssues,
} from "app/client/ui/IkaDocGuidedWorkspaceIssues";

import { assert } from "chai";

describe("IkaDocGuidedWorkspaceIssues", function() {
  afterEach(function() {
    setIkaDocGuidedWorkspaceIssues(null);
  });

  it("indexes backend guided issues by table, Grist row id, and metadata code", function() {
    setIkaDocGuidedWorkspaceIssues({
      success: false,
      simulated: true,
      importedCounts: {},
      updatedCounts: {},
      errors: [
        {
          severity: "ERROR",
          schemaType: "folder",
          message: "Title is required",
          tableId: "Records",
          gristRowId: 17,
          metadataCode: "title",
        },
      ],
      warnings: [],
      conflicts: [],
    });

    assert.deepEqual(
      getIkaDocGuidedWorkspaceCellIssue("Records", 17, "title"),
      {
        severity: "error",
        message: "Title is required",
      },
    );
    assert.equal(
      getIkaDocGuidedWorkspaceCellIssue("Records", 18, "title"),
      null,
    );
  });

  it("lets error issues override warnings for the same cell", function() {
    setIkaDocGuidedWorkspaceIssues({
      success: false,
      simulated: true,
      importedCounts: {},
      updatedCounts: {},
      errors: [
        {
          severity: "ERROR",
          schemaType: "folder",
          message: "Invalid title",
          tableId: "Records",
          gristRowId: 17,
          metadataCode: "title",
        },
      ],
      warnings: [
        {
          severity: "WARNING",
          schemaType: "folder",
          message: "Title will be normalized",
          tableId: "Records",
          gristRowId: 17,
          metadataCode: "title",
        },
      ],
      conflicts: [],
    });

    assert.deepEqual(
      getIkaDocGuidedWorkspaceCellIssue("Records", 17, "title"),
      {
        severity: "error",
        message: "Invalid title",
      },
    );
  });

  it("indexes backend guided conflicts by table, Grist row id, and metadata code", function() {
    setIkaDocGuidedWorkspaceIssues({
      success: false,
      simulated: true,
      importedCounts: {},
      updatedCounts: {},
      errors: [],
      warnings: [],
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
          gristRowId: 17,
        },
      ],
    });

    assert.deepEqual(
      getIkaDocGuidedWorkspaceCellIssue("Records", 17, "title"),
      {
        severity: "error",
        message:
          "Conflict on title; original=Original; yours=Mine; current=Server",
      },
    );
  });

  it("keeps redacted guided conflict values out of the cell message", function() {
    setIkaDocGuidedWorkspaceIssues({
      success: false,
      simulated: true,
      importedCounts: {},
      updatedCounts: {},
      errors: [],
      warnings: [],
      conflicts: [
        {
          rowKey: "row-key-1",
          targetRecordId: "00000000-0000-4000-8000-000000000701",
          metadataCode: "secret",
          originalValue: "Original secret",
          proposedValue: "Mine secret",
          currentValue: "Server secret",
          valuesRedacted: true,
          tableId: "Records",
          gristRowId: 17,
        },
      ],
    });

    assert.deepEqual(
      getIkaDocGuidedWorkspaceCellIssue("Records", 17, "secret"),
      {
        severity: "error",
        message: "Conflict on secret: values are restricted",
      },
    );
  });
});
