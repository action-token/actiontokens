import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FormCardProvider } from "@actiontokens/ui/patterns/form-card";
import { CardTab, FormPage, FormSection, MoreOptions } from "@actiontokens/ui/patterns/form-page";

const card = { onClose: vi.fn(), onDone: vi.fn(), at: null };

function form() {
  return (
    <FormPage
      title="New pin"
      back={{ href: "/pins", label: "Pins" }}
      actions={<button type="submit">Create pin</button>}
      aside={<div>SIDE-MAP</div>}
      cardTabs={[
        { id: "details", label: "Details" },
        { id: "rules", label: "Rules" },
      ]}
      cardHeaderAction={<span>HEADER-ACTION</span>}
    >
      <FormSection title="Title section" tab="details">
        <input name="title" />
      </FormSection>
      <FormSection title="Rules section" tab="rules">
        <input name="limit" />
      </FormSection>
      <FormSection title="Everywhere section">
        <input name="shared" />
      </FormSection>
      <CardTab tab="rules">
        <p>RULES-NOTE</p>
      </CardTab>
      <MoreOptions tab="rules" title="More rules">
        <input name="more" />
      </MoreOptions>
    </FormPage>
  );
}

/** The element's opening tag that has this text after it, to read its classes. */
const wrapperOf = (html: string, text: string) => {
  const at = html.indexOf(text);
  const start = html.lastIndexOf("<section", at);
  return html.slice(start, html.indexOf(">", start));
};

describe("a form in a map card", () => {
  const html = renderToStaticMarkup(<FormCardProvider value={card}>{form()}</FormCardProvider>);

  it("is a card with a header, a close button, the header action and the actions", () => {
    expect(html).toContain("lg:w-[380px]");
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("HEADER-ACTION");
    expect(html).toContain("Create pin");
  });

  it("leaves out the page's side column", () => {
    expect(html).not.toContain("SIDE-MAP");
  });

  it("shows the first tab, hides the others (but keeps them mounted), and shows sections without a tab", () => {
    expect(html).toContain('name="limit"'); // mounted
    expect(wrapperOf(html, "Title section")).not.toContain("hidden");
    expect(wrapperOf(html, "Rules section")).toContain("hidden");
    expect(wrapperOf(html, "Everywhere section")).not.toContain("hidden");
    expect(html).toContain('<div data-card-tab="rules" class="hidden">');
    expect(wrapperOf(html, "More rules")).toContain("hidden");
  });

  it("has a tab for each part of the form", () => {
    expect(html).toContain("Details");
    expect(html).toContain("Rules");
  });
});

describe("the same form on its own page", () => {
  const html = renderToStaticMarkup(form());

  it("keeps the side column and has no card chrome", () => {
    expect(html).toContain("SIDE-MAP");
    expect(html).not.toContain("lg:w-[380px]");
    expect(html).not.toContain('aria-label="Close"');
  });

  it("shows every section, whatever its tab", () => {
    expect(html).not.toContain('class="hidden"');
    expect(html).toContain("Rules section");
    expect(html).not.toContain("HEADER-ACTION");
  });
});

describe("a stepped form card (plan 44 changes)", () => {
  const stepped = renderToStaticMarkup(
    <FormCardProvider value={card}>
      <FormPage
        title="New pin"
        back={{ href: "/pins", label: "Pins" }}
        actions={<button type="submit">Create pin</button>}
        cardTabs={[
          { id: "details", label: "Details" },
          { id: "look", label: "Look" },
        ]}
        cardSteps
        cardSummary={<div>SUMMARY-STRIP</div>}
        cardTabDone={{ details: true, look: false }}
      >
        <FormSection title="Title section" tab="details">
          <input name="title" />
        </FormSection>
      </FormPage>
    </FormCardProvider>,
  );

  it("shows the summary strip under the title", () => {
    expect(stepped.indexOf("SUMMARY-STRIP")).toBeGreaterThan(stepped.indexOf("New pin"));
    expect(stepped.indexOf("SUMMARY-STRIP")).toBeLessThan(stepped.indexOf('role="tablist"'));
  });

  it("starts with Next, not Create, and no Back on the first tab", () => {
    expect(stepped).toContain("Next: Look");
    expect(stepped).not.toContain("Create pin");
    expect(stepped).not.toContain(">Back<");
  });

  it("ticks the tabs that are filled in", () => {
    expect((stepped.match(/aria-label="Filled in"/g) ?? []).length).toBe(1);
  });

  it("puts each section in its own box with an icon badge and a bold title", () => {
    expect(stepped).toMatch(/<section[^>]*rounded-2xl[^>]*>/);
  });
});
