export type Lang = 'glsl' | 'js';

type TokenKind = 'comment' | 'keyword' | 'type' | 'builtin' | 'number' | 'string' | 'pre' | 'uniform' | 'tag' | 'punct' | 'plain';

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

const GLSL_KEYWORDS = words(`
  if else for while do break continue return discard switch case default const in out inout
  uniform layout precision highp mediump lowp struct flat smooth centroid invariant true false
`);
const GLSL_TYPES = words(`
  void bool int uint float vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4
  mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 sampler2D sampler3D samplerCube
`);
const GLSL_BUILTINS = words(`
  radians degrees sin cos tan asin acos atan sinh cosh tanh pow exp log exp2 log2 sqrt inversesqrt
  abs sign floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf
  length distance dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose
  determinant inverse lessThan lessThanEqual greaterThan greaterThanEqual equal notEqual any all not
  texture textureLod texelFetch dFdx dFdy fwidth floatBitsToInt intBitsToFloat mainImage
  gl_FragCoord gl_FragColor
`);
const GLSL_UNIFORMS = words('iTime iResolution iMouse iFrame iTimeDelta');

const JS_KEYWORDS = words(`
  const let var function return if else for while do break continue switch case default new class
  extends super this import export from as of in instanceof typeof void delete try catch finally throw
  async await yield true false null undefined static get set
`);
const JS_TYPES = words('THREE Math Float32Array Uint16Array Uint32Array Array Object Map Set Promise window document');

const pattern = (tags: string) =>
  new RegExp(
    [
      /(\/\*[\s\S]*?(?:\*\/|$))/.source,
      /(\/\/[^\n]*)/.source,
      /(<!--[\s\S]*?(?:-->|$))/.source,
      /(`(?:\\[\s\S]|[^`\\])*`?|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)/.source,
      /(#[ \t]*[a-z]+)/.source,
      /(\b0x[\da-fA-F]+\b|(?:\b\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[uf]?\b)/.source,
      `(${tags})`,
      /([A-Za-z_$][\w$]*)/.source,
      /([{}()[\];,.:?+\-*/%=<>!&|^~])/.source,
    ].join('|'),
    'g',
  );

const PATTERNS: Record<Lang, RegExp> = {
  glsl: pattern('(?!)'),
  js: pattern(/<\/?[A-Za-z][\w-]*|\/>/.source),
};

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => escapeMap[c] ?? c);
}

function classify(match: RegExpExecArray, lang: Lang): TokenKind {
  if (match[1] || match[2] || match[3]) return lang === 'glsl' && match[3] ? 'plain' : 'comment';
  if (match[4]) return lang === 'js' ? 'string' : 'plain';
  if (match[5]) return lang === 'glsl' ? 'pre' : 'plain';
  if (match[6]) return 'number';
  if (match[7]) return lang === 'js' ? 'tag' : 'punct';
  const word = match[8];
  if (word) {
    if (lang === 'glsl') {
      if (GLSL_UNIFORMS.has(word)) return 'uniform';
      if (GLSL_TYPES.has(word)) return 'type';
      if (GLSL_KEYWORDS.has(word)) return 'keyword';
      if (GLSL_BUILTINS.has(word)) return 'builtin';
      return 'plain';
    }
    if (JS_KEYWORDS.has(word)) return 'keyword';
    if (JS_TYPES.has(word)) return 'type';
    return 'plain';
  }
  if (match[9]) return 'punct';
  return 'plain';
}

/**
 * Returns one HTML string per source line. Tokens spanning several lines
 * (block comments, template strings) are closed and reopened at each break.
 */
export function highlightLines(code: string, lang: Lang): string[] {
  const lines: string[] = [''];
  const push = (text: string, kind: TokenKind) => {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push('');
      if (!part) return;
      const html = escapeHtml(part);
      lines[lines.length - 1] += kind === 'plain' ? html : `<span class="tk-${kind}">${html}</span>`;
    });
  };

  const master = PATTERNS[lang];
  master.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = master.exec(code)) !== null) {
    if (match.index > cursor) push(code.slice(cursor, match.index), 'plain');
    push(match[0], classify(match, lang));
    cursor = match.index + match[0].length;
    if (match[0].length === 0) master.lastIndex += 1;
  }
  if (cursor < code.length) push(code.slice(cursor), 'plain');
  return lines;
}

export function highlight(code: string, lang: Lang): string {
  return highlightLines(code, lang).join('\n');
}
