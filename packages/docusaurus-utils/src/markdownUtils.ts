/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import logger from '@docusaurus/logger';
import matter from 'gray-matter';
import {createSlugger, type Slugger, type SluggerOptions} from './slugger';

// Some utilities for parsing Markdown content. These things are only used on
// server-side when we infer metadata like `title` and `description` from the
// content. Most parsing is still done in MDX through the mdx-loader.

/**
 * Parses custom ID from a heading. The ID must be composed of letters,
 * underscores, and dashes only.
 *
 * @param heading e.g. `## Some heading {#some-heading}` where the last
 * character must be `}` for the ID to be recognized
 */
export function parseMarkdownHeadingId(heading: string): {
  /**
   * The heading content sans the ID part, right-trimmed. e.g. `## Some heading`
   */
  text: string;
  /** The heading ID. e.g. `some-heading` */
  id?: string;
} {
  const customHeadingIdRegex = /\s*\{#(?<id>[\w-]+)\}$/;
  const matches = customHeadingIdRegex.exec(heading);
  if (matches) {
    return {
      text: heading.replace(matches[0]!, ''),
      id: matches.groups!.id!,
    };
  }
  return {text: heading, id: undefined};
}

// TODO: Find a better way to do so, possibly by compiling the Markdown content,
// stripping out HTML tags and obtaining the first line.
/**
 * Creates an excerpt of a Markdown file. This function will:
 *
 * - Ignore h1 headings (setext or atx)
 * - Ignore import/export
 * - Ignore code blocks
 *
 * And for the first contentful line, it will strip away most Markdown
 * syntax, including HTML tags, emphasis, links (keeping the text), etc.
 */
export function createExcerpt(fileString: string): string | undefined {
  const fileLines = fileString
    .trimStart()
    // Remove Markdown alternate title
    .replace(/^[^\n]*\n[=]+/g, '')
    .split('\n');
  let inCode = false;
  let inImport = false;
  let lastCodeFence = '';

  for (const fileLine of fileLines) {
    if (fileLine === '' && inImport) {
      inImport = false;
    }
    // Skip empty line.
    if (!fileLine.trim()) {
      continue;
    }

    // Skip import/export declaration.
    if ((/^(?:import|export)\s.*/.test(fileLine) || inImport) && !inCode) {
      inImport = true;
      continue;
    }

    // Skip code block line.
    if (fileLine.trim().startsWith('```')) {
      const codeFence = fileLine.trim().match(/^`+/)![0]!;
      if (!inCode) {
        inCode = true;
        lastCodeFence = codeFence;
        // If we are in a ````-fenced block, all ``` would be plain text instead
        // of fences
      } else if (codeFence.length >= lastCodeFence.length) {
        inCode = false;
      }
      continue;
    } else if (inCode) {
      continue;
    }

    const cleanedLine = fileLine
      // Remove HTML tags.
      .replace(/<[^>]*>/g, '')
      // Remove Title headers
      .replace(/^#[^#]+#?/gm, '')
      // Remove Markdown + ATX-style headers
      .replace(/^#{1,6}\s*(?<text>[^#]*)\s*#{0,6}/gm, '$1')
      // Remove emphasis.
      .replace(/(?<opening>[*_]{1,3})(?<text>.*?)\1/g, '$2')
      // Remove strikethroughs.
      .replace(/~~(?<text>\S.*\S)~~/g, '$1')
      // Remove images.
      .replace(/!\[(?<alt>.*?)\][[(].*?[\])]/g, '$1')
      // Remove footnotes.
      .replace(/\[\^.+?\](?:: .*$)?/g, '')
      // Remove inline links.
      .replace(/\[(?<alt>.*?)\][[(].*?[\])]/g, '$1')
      // Remove inline code.
      .replace(/`(?<text>.+?)`/g, '$1')
      // Remove blockquotes.
      .replace(/^\s{0,3}>\s?/g, '')
      // Remove admonition definition.
      .replace(/:::.*/, '')
      // Remove Emoji names within colons include preceding whitespace.
      .replace(/\s?:(?:::|[^:\n])+:/g, '')
      // Remove custom Markdown heading id.
      .replace(/\{#*[\w-]+\}/, '')
      .trim();

    if (cleanedLine) {
      return cleanedLine;
    }
  }

  return undefined;
}

/**
 * Takes a raw Markdown file content, and parses the front matter using
 * gray-matter. Worth noting that gray-matter accepts TOML and other markup
 * languages as well.
 *
 * @throws Throws when gray-matter throws. e.g.:
 * ```md
 * ---
 * foo: : bar
 * ---
 * ```
 */
export function parseFrontMatter(markdownFileContent: string): {
  /** Front matter as parsed by gray-matter. */
  frontMatter: {[key: string]: unknown};
  /** The remaining content, trimmed. */
  content: string;
} {
  const {data, content} = matter(markdownFileContent);
  return {
    frontMatter: data,
    content: content.trim(),
  };
}

function toTextContentTitle(contentTitle: string): string {
  if (contentTitle.startsWith('`') && contentTitle.endsWith('`')) {
    return contentTitle.substring(1, contentTitle.length - 1);
  }
  return contentTitle;
}

type ParseMarkdownContentTitleOptions = {
  /**
   * If `true`, the matching title will be removed from the returned content.
   * We can promise that at least one empty line will be left between the
   * content before and after, but you shouldn't make too much assumption
   * about what's left.
   */
  removeContentTitle?: boolean;
};

/**
 * Takes the raw Markdown content, without front matter, and tries to find an h1
 * title (setext or atx) to be used as metadata.
 *
 * It only searches until the first contentful paragraph, ignoring import/export
 * declarations.
 *
 * It will try to convert markdown to reasonable text, but won't be best effort,
 * since it's only used as a fallback when `frontMatter.title` is not provided.
 * For now, we just unwrap inline code (``# `config.js` `` => `config.js`).
 */
export function parseMarkdownContentTitle(
  contentUntrimmed: string,
  options?: ParseMarkdownContentTitleOptions,
): {
  /** The content, optionally without the content title. */
  content: string;
  /** The title, trimmed and without the `#`. */
  contentTitle: string | undefined;
} {
  const removeContentTitleOption = options?.removeContentTitle ?? false;

  const content = contentUntrimmed.trim();
  // We only need to detect import statements that will be parsed by MDX as
  // `import` nodes, as broken syntax can't render anyways. That means any block
  // that has `import` at the very beginning and surrounded by empty lines.
  const contentWithoutImport = content
    .replace(/^(?:import\s(?:.|\n(?!\n))*\n{2,})*/, '')
    .trim();

  const regularTitleMatch = /^#[ \t]+(?<title>[^ \t].*)(?:\n|$)/.exec(
    contentWithoutImport,
  );
  const alternateTitleMatch = /^(?<title>.*)\n=+(?:\n|$)/.exec(
    contentWithoutImport,
  );

  const titleMatch = regularTitleMatch ?? alternateTitleMatch;
  if (!titleMatch) {
    return {content, contentTitle: undefined};
  }
  const newContent = removeContentTitleOption
    ? content.replace(titleMatch[0]!, '')
    : content;
  if (regularTitleMatch) {
    return {
      content: newContent.trim(),
      contentTitle: toTextContentTitle(
        regularTitleMatch
          .groups!.title!.trim()
          .replace(/\s*(?:\{#*[\w-]+\}|#+)$/, ''),
      ).trim(),
    };
  }
  return {
    content: newContent.trim(),
    contentTitle: toTextContentTitle(
      alternateTitleMatch!.groups!.title!.trim().replace(/\s*=+$/, ''),
    ).trim(),
  };
}

/**
 * Makes a full-round parse.
 *
 * @throws Throws when `parseFrontMatter` throws, usually because of invalid
 * syntax.
 */
export function parseMarkdownString(
  markdownFileContent: string,
  options?: ParseMarkdownContentTitleOptions,
): {
  /** @see {@link parseFrontMatter} */
  frontMatter: {[key: string]: unknown};
  /** @see {@link parseMarkdownContentTitle} */
  contentTitle: string | undefined;
  /** @see {@link createExcerpt} */
  excerpt: string | undefined;
  /**
   * Content without front matter and (optionally) without title, depending on
   * the `removeContentTitle` option.
   */
  content: string;
} {
  try {
    const {frontMatter, content: contentWithoutFrontMatter} =
      parseFrontMatter(markdownFileContent);

    const {content, contentTitle} = parseMarkdownContentTitle(
      contentWithoutFrontMatter,
      options,
    );

    const excerpt = createExcerpt(content);

    return {
      frontMatter,
      content,
      contentTitle,
      excerpt,
    };
  } catch (err) {
    logger.error(`Error while parsing Markdown front matter.
This can happen if you use special characters in front matter values (try using double quotes around that value).`);
    throw err;
  }
}

function unwrapMarkdownLinks(line: string): string {
  return line.replace(/\[(?<alt>[^\]]+)\]\([^)]+\)/g, (match, p1) => p1);
}

function addHeadingId(
  line: string,
  slugger: Slugger,
  maintainCase: boolean,
): string {
  let headingLevel = 0;
  while (line.charAt(headingLevel) === '#') {
    headingLevel += 1;
  }

  const headingText = line.slice(headingLevel).trimEnd();
  const headingHashes = line.slice(0, headingLevel);
  const slug = slugger.slug(unwrapMarkdownLinks(headingText).trim(), {
    maintainCase,
  });

  return `${headingHashes}${headingText} {#${slug}}`;
}

export type WriteHeadingIDOptions = SluggerOptions & {
  /** Overwrite existing heading IDs. */
  overwrite?: boolean;
};

/**
 * Takes Markdown content, returns new content with heading IDs written.
 * Respects existing IDs (unless `overwrite=true`) and never generates colliding
 * IDs (through the slugger).
 */
export function writeMarkdownHeadingId(
  content: string,
  options: WriteHeadingIDOptions = {maintainCase: false, overwrite: false},
): string {
  const {maintainCase = false, overwrite = false} = options;
  const lines = content.split('\n');
  const slugger = createSlugger();

  // If we can't overwrite existing slugs, make sure other headings don't
  // generate colliding slugs by first marking these slugs as occupied
  if (!overwrite) {
    lines.forEach((line) => {
      const parsedHeading = parseMarkdownHeadingId(line);
      if (parsedHeading.id) {
        slugger.slug(parsedHeading.id);
      }
    });
  }

  let inCode = false;
  return lines
    .map((line) => {
      if (line.startsWith('```')) {
        inCode = !inCode;
        return line;
      }
      // Ignore h1 headings, as we don't create anchor links for those
      if (inCode || !line.startsWith('##')) {
        return line;
      }
      const parsedHeading = parseMarkdownHeadingId(line);

      // Do not process if id is already there
      if (parsedHeading.id && !overwrite) {
        return line;
      }
      return addHeadingId(parsedHeading.text, slugger, maintainCase);
    })
    .join('\n');
}
