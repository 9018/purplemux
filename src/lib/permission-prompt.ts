const OPTION_KEYWORDS = [
  'Yes', 'Yes,', 'No',
  'Accept', 'Decline',
  'Open System Settings', 'Try again',
  'Use this', 'Continue without',
  // ink Select dialog keywords (Resume Return, Idle Return)
  'Resume from summary', 'Resume full session',
  'Continue this conversation', 'Send message as',
  "Don't ask me again",
];
const INDICATOR_RE = /^\s*(?:[❯›>]\s+)?(.+)$/;
const FOCUSED_RE = /^\s*[❯›>]\s+/;
const NUMBER_PREFIX_RE = /^(\d+)\.\s+/;
// 좁은 터미널에서 "2. Yes..."가 "2Yes..."로 렌더되는 wrap 아티팩트까지 허용하기 위해 period/space를 optional로 둠
const NUMBERED_LINE_RE = /^\s*([❯›>])?\s*(?:[↓↑]\s*)?(\d+)\.?\s*(\S.*)$/;
const SEPARATOR_LINE_RE = /^[\s─━\-]+$/;

export interface IParsedPromptOptions {
  options: string[];
  focusedIndex: number;
  title?: string;
  request?: string;
}

export const stripNumberPrefix = (label: string) => label.replace(NUMBER_PREFIX_RE, '');
export const optionNumber = (label: string): string | null => label.match(NUMBER_PREFIX_RE)?.[1] ?? null;
const hasOption = (options: string[], prefix: string) =>
  options.some((o) => stripNumberPrefix(o).startsWith(prefix));
const leadingSpaces = (line: string): number => line.match(/^\s*/)?.[0].length ?? 0;
const cleanPromptLine = (line: string): string =>
  line.trim().replace(/^[☐☑]\s*/, '').trim();
const isPromptTitleLine = (line: string): boolean => /^[\s]*[☐☑]\s*\S/.test(line);

// tmux pane capture가 손상된 경우 원본 옵션 텍스트를 복원한다.
// - "Yescurrent status for this tab"처럼 다른 UI 영역이 뒤에 붙은 경우 "Yes"만 남김
// - "Yes, and don't ask: <cmd>"처럼 "again for" 구간이 유실된 경우 canonical 형태로 복원
//   (이미 canonical한 텍스트는 건드리지 않아 원본 따옴표 문자를 보존)
const DAMAGED_DONT_ASK_RE = /^(Yes,\s*and\s+don[\u2019']?t\s+ask)\s*:\s*(.+)$/;

const normalizeOption = (text: string): string => {
  const damaged = text.match(DAMAGED_DONT_ASK_RE);
  if (damaged) return `${damaged[1]} again for: ${damaged[2].trim()}`;
  if (/^Yes(?![,\s]|$)/.test(text)) return 'Yes';
  if (/^No(?![,\s]|$)/.test(text)) return 'No';
  return text;
};

const isKnownPromptPattern = (options: string[]): boolean => {
  if (options.length < 2) return false;
  return (hasOption(options, 'Yes') && hasOption(options, 'No'))
    || (hasOption(options, 'Accept') && hasOption(options, 'Decline'))
    || hasOption(options, 'Open System Settings')
    || (hasOption(options, 'Use this') && hasOption(options, 'Continue without'))
    || (hasOption(options, 'Resume from summary') && hasOption(options, 'Resume full session'))
    || (hasOption(options, 'Continue this conversation') && hasOption(options, 'Send message as'));
};

const extractPromptText = (lines: string[], optionStartIndex: number): Pick<IParsedPromptOptions, 'title' | 'request'> => {
  if (optionStartIndex <= 0) return {};

  let cursor = optionStartIndex - 1;
  while (cursor >= 0 && (!lines[cursor].trim() || SEPARATOR_LINE_RE.test(lines[cursor]))) cursor -= 1;

  const requestLines: string[] = [];
  while (cursor >= 0 && lines[cursor].trim() && !SEPARATOR_LINE_RE.test(lines[cursor])) {
    requestLines.unshift(cleanPromptLine(lines[cursor]));
    cursor -= 1;
  }

  while (cursor >= 0 && (!lines[cursor].trim() || SEPARATOR_LINE_RE.test(lines[cursor]))) cursor -= 1;

  const titleLines: string[] = [];
  const rawTitleLines: string[] = [];
  while (cursor >= 0 && lines[cursor].trim() && !SEPARATOR_LINE_RE.test(lines[cursor])) {
    rawTitleLines.unshift(lines[cursor]);
    titleLines.unshift(cleanPromptLine(lines[cursor]));
    cursor -= 1;
  }

  const request = requestLines.join('\n').trim();
  const title = rawTitleLines.some(isPromptTitleLine)
    ? titleLines.join('\n').trim()
    : '';
  return {
    ...(title && { title }),
    ...(request && { request }),
  };
};

const withPromptText = (
  parsed: IParsedPromptOptions,
  lines: string[],
  optionStartIndex: number,
): IParsedPromptOptions => ({
  ...parsed,
  ...extractPromptText(lines, optionStartIndex),
});

const parseNumberedOptions = (lines: string[]): IParsedPromptOptions => {
  // 스크롤백에 이전 프롬프트 블록이 남아있는 경우 마지막 블록을 선택한다
  const blocks: { rawOptions: string[]; focusedIndex: number; optionStartIndex: number }[] = [];
  let rawOptions: string[] = [];
  let focusedIndex = 0;
  let expected = 1;
  let lastOptionIndent = 0;
  let optionStartIndex = -1;

  const flush = () => {
    if (rawOptions.length >= 2) {
      blocks.push({ rawOptions: rawOptions.slice(), focusedIndex, optionStartIndex });
    }
    rawOptions = [];
    focusedIndex = 0;
    expected = 1;
    lastOptionIndent = 0;
    optionStartIndex = -1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // 손상된 pane capture에서 옵션 사이에 빈 줄이 끼어 있을 수 있으므로 break하지 않고 계속 탐색
    if (!line.trim()) continue;

    const match = line.match(NUMBERED_LINE_RE);
    if (match) {
      const marker = match[1];
      const num = Number(match[2]);
      const rest = match[3].trim();
      if (rest.length > 0) {
        if (num === 1) {
          flush();
          rawOptions.push(rest);
          if (marker) focusedIndex = 0;
          lastOptionIndent = leadingSpaces(line);
          optionStartIndex = i;
          expected = 2;
          continue;
        }
        if (num === expected) {
          if (marker) focusedIndex = rawOptions.length;
          rawOptions.push(rest);
          lastOptionIndent = leadingSpaces(line);
          expected += 1;
          continue;
        }
      }
    }

    if (rawOptions.length > 0) {
      // 긴 옵션이 터미널 width를 초과해 soft-wrap된 경우: 연속 라인은 원본 옵션보다 더 깊이 들여쓰기됨
      if (leadingSpaces(line) > lastOptionIndent) {
        rawOptions[rawOptions.length - 1] += line.trimStart();
        continue;
      }
      if (/^\s+\S/.test(line)) continue;
      flush();
    }
  }
  flush();

  const best = blocks[blocks.length - 1];
  if (!best) return { options: [], focusedIndex: 0 };

  return {
    ...withPromptText({
      options: best.rawOptions.map((raw, i) => `${i + 1}. ${normalizeOption(raw)}`),
      focusedIndex: best.focusedIndex,
    }, lines, best.optionStartIndex),
  };
};

const parseKeywordOptions = (lines: string[]): IParsedPromptOptions => {
  const options: string[] = [];
  let focusedIndex = 0;
  let optionStartIndex = -1;
  let foundFirst = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      if (foundFirst) break;
      continue;
    }

    const isFocused = FOCUSED_RE.test(line);
    const isIndented = /^\s+\S/.test(line);

    if (!isFocused && !isIndented) {
      if (foundFirst) break;
      continue;
    }

    const match = line.match(INDICATOR_RE);
    if (!match) continue;
    const label = match[1].trim();
    const stripped = stripNumberPrefix(label);
    const isKeyword = OPTION_KEYWORDS.some((kw) => stripped.startsWith(kw));

    if (isKeyword) {
      if (options.length === 0) optionStartIndex = i;
      if (isFocused) focusedIndex = options.length;
      options.push(label);
      foundFirst = true;
    }
  }

  return withPromptText({ options, focusedIndex }, lines, optionStartIndex);
};

export const parseChoiceOptions = (paneContent: string): IParsedPromptOptions => {
  const lines = paneContent.split('\n');
  const blocks: { options: string[]; focusedIndex: number; optionStartIndex: number }[] = [];
  let options: string[] = [];
  let focusedIndex = -1;
  let lastNumber = 0;
  let optionStartIndex = -1;

  const flush = () => {
    if (options.length >= 2 && focusedIndex >= 0) {
      blocks.push({ options: options.slice(), focusedIndex, optionStartIndex });
    }
    options = [];
    focusedIndex = -1;
    lastNumber = 0;
    optionStartIndex = -1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (SEPARATOR_LINE_RE.test(line)) continue;

    const match = line.match(NUMBERED_LINE_RE);
    if (match) {
      const marker = match[1];
      const num = Number(match[2]);
      const rest = match[3].trim();

      if (options.length > 0 && num <= lastNumber) flush();
      if (rest.length > 0) {
        if (options.length === 0) optionStartIndex = i;
        if (marker) focusedIndex = options.length;
        options.push(`${num}. ${normalizeOption(rest)}`);
        lastNumber = num;
        continue;
      }
    }

    if (options.length > 0 && !/^\s+\S/.test(line)) flush();
  }
  flush();

  const best = blocks[blocks.length - 1];
  if (!best) return { options: [], focusedIndex: 0 };

  return withPromptText({
    options: best.options,
    focusedIndex: best.focusedIndex,
  }, lines, best.optionStartIndex);
};

export const parsePermissionOptions = (paneContent: string): IParsedPromptOptions => {
  const lines = paneContent.split('\n');

  const numbered = parseNumberedOptions(lines);
  if (numbered.options.length >= 2 && isKnownPromptPattern(numbered.options)) {
    return numbered;
  }

  const keyword = parseKeywordOptions(lines);
  if (!isKnownPromptPattern(keyword.options)) {
    return { options: [], focusedIndex: 0 };
  }
  return keyword;
};

export const hasPermissionPrompt = (paneContent: string): boolean =>
  parsePermissionOptions(paneContent).options.length > 0;
