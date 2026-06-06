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
const NUMBER_PREFIX_RE = /^\d+\.\s+/;
// 좁은 터미널에서 "2. Yes..."가 "2Yes..."로 렌더되는 wrap 아티팩트까지 허용하기 위해 period/space를 optional로 둠
const NUMBERED_LINE_RE = /^\s*([❯›>])?\s*(?:[↓↑]\s*)?(\d+)\.?\s*(\S.*)$/;
const SEPARATOR_LINE_RE = /^[\s─━\-]+$/;

const stripPrefix = (o: string) => o.replace(NUMBER_PREFIX_RE, '');
const hasOption = (options: string[], prefix: string) =>
  options.some((o) => stripPrefix(o).startsWith(prefix));
const leadingSpaces = (line: string): number => line.match(/^\s*/)?.[0].length ?? 0;

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

const parseNumberedOptions = (lines: string[]): { options: string[]; focusedIndex: number } => {
  // 스크롤백에 이전 프롬프트 블록이 남아있는 경우 마지막 블록을 선택한다
  const blocks: { rawOptions: string[]; focusedIndex: number }[] = [];
  let rawOptions: string[] = [];
  let focusedIndex = 0;
  let expected = 1;
  let lastOptionIndent = 0;

  const flush = () => {
    if (rawOptions.length >= 2) {
      blocks.push({ rawOptions: rawOptions.slice(), focusedIndex });
    }
    rawOptions = [];
    focusedIndex = 0;
    expected = 1;
    lastOptionIndent = 0;
  };

  for (const line of lines) {
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
    options: best.rawOptions.map((raw, i) => `${i + 1}. ${normalizeOption(raw)}`),
    focusedIndex: best.focusedIndex,
  };
};

const parseKeywordOptions = (lines: string[]): { options: string[]; focusedIndex: number } => {
  const options: string[] = [];
  let focusedIndex = 0;
  let foundFirst = false;

  for (const line of lines) {
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
    const stripped = stripPrefix(label);
    const isKeyword = OPTION_KEYWORDS.some((kw) => stripped.startsWith(kw));

    if (isKeyword) {
      if (isFocused) focusedIndex = options.length;
      options.push(label);
      foundFirst = true;
    }
  }

  return { options, focusedIndex };
};

export const parseChoiceOptions = (paneContent: string): { options: string[]; focusedIndex: number } => {
  const lines = paneContent.split('\n');
  const blocks: { options: string[]; focusedIndex: number }[] = [];
  let options: string[] = [];
  let focusedIndex = -1;
  let lastNumber = 0;

  const flush = () => {
    if (options.length >= 2 && focusedIndex >= 0) {
      blocks.push({ options: options.slice(), focusedIndex });
    }
    options = [];
    focusedIndex = -1;
    lastNumber = 0;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (SEPARATOR_LINE_RE.test(line)) continue;

    const match = line.match(NUMBERED_LINE_RE);
    if (match) {
      const marker = match[1];
      const num = Number(match[2]);
      const rest = match[3].trim();

      if (options.length > 0 && num <= lastNumber) flush();
      if (rest.length > 0) {
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
  return best ?? { options: [], focusedIndex: 0 };
};

export const parsePermissionOptions = (paneContent: string): { options: string[]; focusedIndex: number } => {
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
