import { describe, expect, it } from 'vitest';

import { hasPermissionPrompt, parseChoiceOptions, parsePermissionOptions } from '@/lib/permission-prompt';

describe('parsePermissionOptions', () => {
  it('numbered Yes/No 프롬프트에서 포커스된 옵션을 인식한다', () => {
    const pane = [
      'Do you want to proceed?',
      '',
      '❯ 1. Yes',
      '  2. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual(['1. Yes', '2. No']);
    expect(result.focusedIndex).toBe(0);
  });

  it('좁은 터미널에서 "2Yes"처럼 wrap된 라인도 파싱한다', () => {
    const pane = [
      'Permission required',
      '',
      '  1. Yes',
      '❯ 2Yes, and don\'t ask again',
      '  3. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toHaveLength(3);
    expect(result.focusedIndex).toBe(1);
    expect(result.options[1]).toContain("Yes, and don't ask again");
  });

  it('알려지지 않은 패턴은 빈 옵션을 반환한다', () => {
    const pane = [
      'Some random output',
      '❯ Foo',
      '  Bar',
    ].join('\n');

    expect(parsePermissionOptions(pane)).toEqual({ options: [], focusedIndex: 0 });
  });

  it('손상된 pane capture에서 옵션 텍스트를 복원한다', () => {
    const pane = [
      'Do you want to proceed?',
      ' ❯ 1. Yescurrent status for this tab',
      "  2.Yes, and don't ask: curl -s http://localhost:8022/api/status",
      '',
      '   3. No',
      ' Esc to cancel · Tab to amend · ctrl+e to explain',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual([
      '1. Yes',
      "2. Yes, and don't ask again for: curl -s http://localhost:8022/api/status",
      '3. No',
    ]);
    expect(result.focusedIndex).toBe(0);
  });

  it('terminal soft-wrap으로 다음 줄로 이어진 긴 옵션을 합친다', () => {
    const pane = [
      ' Do you want to proceed?',
      ' ❯ 1. Yes',
      "   2. Yes, and don\u2019t ask again for: python3 -c \"import sys,json; d=json.loads(sys.stdin.read()); print('type:',d.get('type'),'| timestamp:',d.get('timestamp'),'|",
      "                                  stop_reason:',d.get('message',{}).get('stop_reason'))\"",
      '   3. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual([
      '1. Yes',
      "2. Yes, and don\u2019t ask again for: python3 -c \"import sys,json; d=json.loads(sys.stdin.read()); print('type:',d.get('type'),'| timestamp:',d.get('timestamp'),'|stop_reason:',d.get('message',{}).get('stop_reason'))\"",
      '3. No',
    ]);
    expect(result.focusedIndex).toBe(0);
  });

  it('스크롤백에 이전 프롬프트가 남아있으면 가장 최근 블록을 선택한다', () => {
    const pane = [
      'Do you want to proceed?',
      ' ❯ 1. Yes',
      "   2. Yes, and don\u2019t ask again for: python3 -c \"import sys,json\"",
      '   3. No',
      '',
      '> running command...',
      'output line',
      '',
      'Do you want to proceed?',
      '   1. Yes',
      " ❯ 2. Yes, and don\u2019t ask again for tmux list-sessions",
      '   3. No',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toHaveLength(3);
    expect(result.options[1]).toContain('tmux list-sessions');
    expect(result.focusedIndex).toBe(1);
  });

  it('keyword 기반 Accept/Decline 프롬프트를 인식한다', () => {
    const pane = [
      'Trust this workspace?',
      '',
      '❯ Accept',
      '  Decline',
    ].join('\n');

    const result = parsePermissionOptions(pane);

    expect(result.options).toEqual(['Accept', 'Decline']);
    expect(result.focusedIndex).toBe(0);
  });
});

describe('hasPermissionPrompt', () => {
  it('유효한 프롬프트에서 true를 반환한다', () => {
    const pane = '\n❯ 1. Yes\n  2. No\n';
    expect(hasPermissionPrompt(pane)).toBe(true);
  });

  it('프롬프트가 없으면 false를 반환한다', () => {
    expect(hasPermissionPrompt('just some logs\nmore logs')).toBe(false);
  });
});

describe('parseChoiceOptions', () => {
  it('Claude AskUserQuestion numbered menu를 일반 선택지로 파싱한다', () => {
    const pane = [
      ' ☐ 변경사항',
      '',
      '커밋 안 된 변경사항(pane-container.tsx, capture-at-width.ts)을 어떻게 처리할까요?',
      '',
      '❯ 1. 내용 먼저 리뷰',
      '     두 파일의 diff를 분석해서 무엇이 바뀌었는지, 문제는 없는지 설명합니다.',
      '  2. 바로 커밋',
      '     변경사항을 영어 커밋 메시지로 정리해 커밋합니다.',
      '  3. 그대로 두기',
      '     아무것도 하지 않고 다른 작업을 진행합니다.',
      '  4. Type something.',
      '────────────────────────────────────────────────────────────────',
      '  5. Chat about this',
    ].join('\n');

    expect(parsePermissionOptions(pane)).toEqual({ options: [], focusedIndex: 0 });
    expect(parseChoiceOptions(pane)).toEqual({
      options: [
        '1. 내용 먼저 리뷰',
        '2. 바로 커밋',
        '3. 그대로 두기',
        '4. Type something.',
        '5. Chat about this',
      ],
      focusedIndex: 0,
    });
  });

  it('중간 번호가 보이지 않아도 실제 번호 prefix를 유지한다', () => {
    const pane = [
      '❯ 1. 첫 번째',
      '  2. 두 번째',
      '↓ 4. 네 번째',
      '  6. Chat about this',
    ].join('\n');

    expect(parseChoiceOptions(pane).options).toEqual([
      '1. 첫 번째',
      '2. 두 번째',
      '4. 네 번째',
      '6. Chat about this',
    ]);
  });
});
