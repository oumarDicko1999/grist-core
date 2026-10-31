import { makeT } from "app/client/lib/localization";
import { bigBasicButtonLink, bigPrimaryButton } from "app/client/ui2018/buttons";
import { theme, vars } from "app/client/ui2018/cssVars";
import { getGristConfig } from "app/common/urlUtils";
import { IkaDocRefusalKind, ikaDocRefusalKind } from "app/ikadoc/IkaDocRefusal";

import { dom, DomContents, makeTestId, styled } from "grainjs";

const t = makeT("IkaDocRefusalPage");
const testId = makeTestId("test-ikadoc-refusal-");

/**
 * Seam for Grist's error pages (errorPages.ts, GW-SHL-02).
 * In an IkaDoc deployment, every refusal is an IkaDoc page that leads back to the work.
 * Returns undefined outside IkaDoc.
 */
export function buildIkaDocRefusalPage(): DomContents | undefined {
  const config = getGristConfig();
  if (!config.ikadoc && !config.ikadocDeployment) {
    return undefined;
  }

  const refusalCode = config.errDetails?.ikadocRefusal;
  const kind = ikaDocRefusalKind(refusalCode, config.errMessage);
  const { title, explanation } = refusalTexts(kind);

  const returnUrl = config.ikadocDeployment?.returnUrl;
  const reference = refusalCode ?? config.errPage ?? "error";
  document.title = title;

  const backButton = history.length > 1 ?
    bigPrimaryButton(
      t("Back to the spreadsheet"),
      dom.on("click", () => history.back()),
      testId("back"),
    ) :
    null;

  const returnLink = returnUrl ?
    bigBasicButtonLink(t("Back to IkaDoc"), { href: returnUrl }, testId("return")) :
    null;

  return cssPage(
    cssCard(
      cssTitle(title, testId("title")),
      cssExplanation(explanation, testId("explanation")),
      cssActions(backButton, returnLink),
      cssReference(t("Reference: {{reference}}", { reference }), testId("reference")),
    ),
  );
}

function refusalTexts(kind: IkaDocRefusalKind): { title: string; explanation: string } {
  switch (kind) {
    case "session-expired":
      return {
        title: t("Your session has ended"),
        explanation: t(
          "Open the spreadsheet again from IkaDoc to continue with up-to-date data.",
        ),
      };

    case "access-changed":
      return {
        title: t("Your access has changed"),
        explanation: t(
          "Your rights on this spreadsheet changed. Ask its owner, or open it again from IkaDoc.",
        ),
      };

    case "service-unavailable":
      return {
        title: t("The spreadsheet is unavailable right now"),
        explanation: t("IkaDoc could not open the spreadsheet. Try again in a moment."),
      };

    case "page-unavailable":
      return {
        title: t("This page is not available here"),
        explanation: t(
          "The spreadsheet only opens from IkaDoc. Grist's own home and settings pages are not part of it.",
        ),
      };
  }
}

const cssPage = styled("div", `
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  background-color: ${theme.pageBg};
  font-family: ${vars.fontFamily};
`);

const cssCard = styled("div", `
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 40px 36px;
  border-radius: 16px;
  border: 1px solid ${theme.pagePanelsBorder};
  background-color: ${theme.mainPanelBg};
`);

const cssTitle = styled("h1", `
  margin: 0;
  font-size: 26px;
  font-weight: 500;
  color: ${theme.text};
`);

const cssExplanation = styled("p", `
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: ${theme.mediumText};
`);

const cssActions = styled("div", `
  display: flex;
  flex-wrap: wrap;
  gap: 10px;

  &:empty {
    display: none;
  }
`);

const cssReference = styled("p", `
  margin: 0;
  font-size: 12px;
  color: ${theme.lightText};
`);
