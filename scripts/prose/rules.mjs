const RULES = [
  {
    id: 'em-dash',
    pattern: /—/gu,
    message: 'Replace the em dash with direct punctuation.',
  },
  {
    id: 'canonical',
    pattern:
      /\bcanonical(?:ly|iz(?:e|es|ed|ing|ation|ations)|is(?:e|es|ed|ing|ation|ations))?\b/giu,
    message: 'Name the exact file, format, or reference instead.',
  },
  {
    id: 'deterministic',
    pattern: /\bdeterministic(?:ally)?\b/giu,
    message: 'Describe the stable behavior that readers can observe.',
  },
  {
    id: 'robust',
    pattern: /\brobust(?:ly|ness)?\b/giu,
    message: 'State the failure handling or guarantee directly.',
  },
  {
    id: 'seamless',
    pattern: /\bseamless(?:ly)?\b/giu,
    message: 'Describe the actual handoff or workflow.',
  },
  {
    id: 'idiomatic',
    pattern: /\bidiomatic(?:ally)?\b/giu,
    message: 'Name the convention being followed.',
  },
  {
    id: 'modern',
    pattern: /\bmodern\b/giu,
    message: 'Name the runtime, API, or feature requirement.',
  },
  {
    id: 'batteries-included',
    pattern: /\bbatteries(?:-| )included\b/giu,
    message: 'List the included behavior that matters.',
  },
  {
    id: 'full-featured',
    pattern: /\bfull(?:-| )featured\b/giu,
    message: 'List the relevant capability.',
  },
  {
    id: 'source-of-truth',
    pattern: /\b(?:single )?source of truth\b/giu,
    message: 'Name the file or system that owns the information.',
  },
  {
    id: 'powerful',
    pattern: /\bpowerful\b/giu,
    message: 'Describe what the feature does.',
  },
  {
    id: 'comprehensive',
    pattern: /\bcomprehensive(?:ly)?\b/giu,
    message: 'State the covered scope.',
  },
  {
    id: 'production-ready',
    pattern: /\bproduction(?:-| )ready\b/giu,
    message: 'State the checks or support policy.',
  },
  {
    id: 'best-in-class',
    pattern: /\bbest(?:-| )in(?:-| )class\b/giu,
    message: 'Remove the unsupported comparison.',
  },
  {
    id: 'game-changing',
    pattern: /\bgame(?:-| )changing\b/giu,
    message: 'Describe the concrete change.',
  },
  {
    id: 'effortless',
    pattern: /\beffortless(?:ly)?\b/giu,
    message: 'Describe the required steps.',
  },
  {
    id: 'unlock',
    pattern: /\bunlock(?:s|ed|ing)?\b/giu,
    message: 'State what becomes available.',
  },
  {
    id: 'leverage',
    pattern: /\bleverag(?:e|es|ed|ing)\b/giu,
    message: 'Use “use” or name the exact relationship.',
  },
  {
    id: 'utilize',
    pattern: /\butili(?:ze|zes|zed|zing|se|ses|sed|sing)\b/giu,
    message: 'Use “use” when that is what the sentence means.',
  },
  {
    id: 'delve',
    pattern: /\bdelv(?:e|es|ed|ing)\b/giu,
    message: 'State the action directly.',
  },
  {
    id: 'vague-product-claim',
    pattern:
      /\b(?:scalable|streamlined?|intuitive|flexible|efficient|elegant|innovative|transformative|holistic|actionable|meaningful|reliable|consistent|simple|easy|straightforward)\b/giu,
    message: 'Replace the quality claim with an observable behavior.',
  },
  {
    id: 'stock-claim',
    pattern:
      /\b(?:end(?:-| )to(?:-| )end|out of the box|at scale|with confidence|with ease|future(?:-| )proof|frictionless|one(?:-| )stop|known(?:-| )good|non(?:-| )destructive|idempotent)\b/giu,
    message: 'Name the exact scope, step, or guarantee.',
  },
  {
    id: 'reader-permission',
    pattern:
      /\b(?:you can|you may|allows? you to|enables? you to|lets? you)\b/giu,
    message: 'Use a direct instruction or state the capability.',
  },
  {
    id: 'assurance-verb',
    pattern: /\b(?:ensure|ensures|ensured|ensuring)\b/giu,
    message: 'Name the check or constraint that produces the result.',
  },
  {
    id: 'purpose-preface',
    pattern:
      /\b(?:designed to|built to|in order to|serves as|acts as|aims to|strives to)\b/giu,
    message: 'State what the product or action does.',
  },
  {
    id: 'filler-introduction',
    pattern:
      /\b(?:in today['’]s|in the ever-evolving|it is worth noting that|it['’]s worth noting that|at its core|at the end of the day|when it comes to|in a world where|the reality is)\b/giu,
    message: 'Start with the project, task, or result.',
  },
  {
    id: 'throat-clearing',
    pattern:
      /\b(?:here['’]s (?:the thing|what\b|this\b|that\b|why\b|the problem though)|the uncomfortable truth is|it turns out|the real [a-z][a-z -]{0,50} is|let me be clear|the truth is|i['’]ll say it again|i['’]m going to be honest|can we talk about)\b/giu,
    message: 'State the point without announcing it.',
  },
  {
    id: 'emphasis-crutch',
    pattern:
      /\b(?:full stop|let that sink in|this matters because|make no mistake|here['’]s why that matters)\b/giu,
    message: 'Remove the emphasis cue and state the fact.',
  },
  {
    id: 'business-jargon',
    pattern:
      /\b(?:navigate (?:challenges|complexity|uncertainty)|unpack (?:this|the analysis)|lean into|fast-paced landscape|game(?:-| )changer|double down|deep dive|take a step back|moving forward|circle back|on the same page)\b/giu,
    message: 'Use a direct verb or name the exact task.',
  },
  {
    id: 'filler-adverb',
    pattern:
      /(?<!\bnot )\bjust\b|\b(?:really|literally|genuinely|honestly|simply|actually|deeply|truly|fundamentally|inherently|inevitably|interestingly|importantly|crucially)\b/giu,
    message: 'Remove the filler or replace it with a specific fact.',
  },
  {
    id: 'sequence-adverb',
    pattern: /(?:^|[.!?]\s+|\n\s*\n\s*)Then\b|,\s*then\b/gu,
    focusPattern: /\bthen\b/iu,
    message: 'Write each action as a direct instruction.',
  },
  {
    id: 'ly-adverb',
    pattern:
      /\b(?!(?:actually|ally|apply|assembly|belly|canonically|comprehensively|crucially|deeply|deterministically|effortlessly|family|fly|fundamentally|genuinely|honestly|idiomatically|importantly|inevitably|inherently|interestingly|lily|literally|multiply|noreply|poly|really|readonly|rely|reply|robustly|seamlessly|simply|supply|truly)\b)[a-z]+ly\b/giu,
    message: 'Remove the adverb and state the action or constraint directly.',
  },
  {
    id: 'wh-sentence-opener',
    pattern:
      /(?:^|[.!?]\s+|\n\s*\n\s*)(?:what|when|where|which|who|why|how)\b/giu,
    focusPattern: /\b(?:what|when|where|which|who|why|how)\b/iu,
    message: 'Lead with the subject or action instead of a Wh-word opener.',
  },
  {
    id: 'conditional-opener',
    pattern: /(?:^|[.!?]\s+|\n\s*\n\s*)If\b|(?:^|\n)\s*(?:#|\/\/)\s*If\b/gu,
    focusPattern: /\bif\b/iu,
    message: 'Lead with the condition or required action directly.',
  },
  {
    id: 'reduced-passive',
    pattern:
      /(?<!\bam )(?<!\bare )(?<!\bis )(?<!\bwas )(?<!\bwere )(?<!\bbe )(?<!\bbeen )(?<!\bbeing )\b(?:accepted|assigned|built|created|declared|enforced|expected|exported|generated|owned|passed|produced|provided|required|returned|supplied|supported|tracked|used|written)\s+by\b/giu,
    message: 'Name the actor before the action.',
  },
  {
    id: 'passive-voice',
    pattern:
      /\b(?:am|are|is|was|were|be|been|being)\s+(?:[a-z]+ed|[a-z]+en|built|bought|caught|done|found|given|kept|known|made|read|run|sent|set|shown|sold|taught|thought|thrown|told|understood|written)\b/giu,
    message: 'Name the actor and use active voice.',
  },
  {
    id: 'passive-fragment',
    pattern: /(?:^|[.!?]\s+|\n\s*\n\s*)error\s+(?:caught|returned|thrown)\b/giu,
    focusPattern: /\berror\s+(?:caught|returned|thrown)\b/iu,
    message: 'Name the code or action that raises the error.',
  },
  {
    id: 'meta-commentary',
    pattern:
      /\b(?:hint|plot twist|spoiler|you already know this, but|but that['’]s another post|is a feature,? not a bug|dressed up as|the rest of this (?:essay|guide|section)|let me walk you through|in this section,? we['’]ll|as we['’]ll see|i want to explore)\b/giu,
    message: 'Let the document move without narrating its structure.',
  },
  {
    id: 'performative-emphasis',
    pattern: /\b(?:creeps in|i promise)\b/giu,
    message: 'State the fact without manufactured emphasis.',
  },
  {
    id: 'positional-reference',
    pattern:
      /\b(?:shown above|listed above|shown below|listed below|notes below|checklist below|commands (?:above|below)|assertions above|isolation above)\b/giu,
    message: 'Name the command, check, or section instead of its position.',
  },
  {
    id: 'rhetorical-setup',
    pattern:
      /\b(?:what if|here['’]s what i mean|think about it|and that['’]s okay)\b/giu,
    message: 'State the answer directly.',
  },
  {
    id: 'vague-significance',
    pattern:
      /\b(?:the reasons are structural|the implications are significant|this is the deepest problem|the stakes are high|the consequences are real)\b/giu,
    message: 'Name the specific reason, implication, or consequence.',
  },
  {
    id: 'narrator-distance',
    pattern: /\b(?:this happens because|this is why|people tend to)\b/giu,
    message: 'Name the person, action, or constraint.',
  },
  {
    id: 'binary-reframe',
    pattern:
      /\b(?:the (?:answer|question|problem) (?:isn['’]t|is not)|it feels like|stops being|doesn['’]t mean)\b/giu,
    message: 'State the conclusion without a setup-and-reveal contrast.',
  },
  {
    id: 'binary-pivot',
    pattern:
      /\bnot (?:only|just)\b(?:(?![.!?]|\n\s*\n)[\s\S]){0,120}\bbut (?:also )?\b/giu,
    message: 'Write the two facts as direct statements.',
  },
  {
    id: 'binary-contrast',
    pattern:
      /\bnot\s+(?!(?:only|just)\b)(?:(?![.!?]|\n\s*\n)[\s\S]){0,120}\bbut\b/giu,
    message: 'State the conclusion without a negation-and-reveal structure.',
  },
]

export const PROSE_RULES = Object.freeze(RULES)

// Keep exceptions exact and rare. Each entry must match one file, rule, and
// complete matched phrase.
export const PROSE_ALLOWLIST = Object.freeze([])

function isAllowed({ file, ruleId, match }) {
  return PROSE_ALLOWLIST.some(
    entry =>
      entry.file === file &&
      entry.ruleId === ruleId &&
      entry.match.toLocaleLowerCase() === match.toLocaleLowerCase()
  )
}

function lineAndColumn(text, index, startLine, startColumn) {
  const before = text.slice(0, index)
  const lines = before.split('\n')

  return {
    line: startLine + lines.length - 1,
    column:
      lines.length === 1
        ? startColumn + lines[0].length
        : 1 + lines.at(-1).length,
  }
}

export function scanText(
  file,
  text,
  { positionAtIndex, startLine = 1, startColumn = 1 } = {}
) {
  const violations = []

  for (const rule of PROSE_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags)

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) {
        continue
      }

      let value = match[0]
      let matchIndex = match.index
      if (rule.focusPattern) {
        const focusPattern = new RegExp(
          rule.focusPattern.source,
          rule.focusPattern.flags.replace('g', '')
        )
        const focus = focusPattern.exec(value)
        if (focus?.index !== undefined) {
          matchIndex += focus.index
          value = focus[0]
        }
      }

      if (isAllowed({ file, ruleId: rule.id, match: value })) {
        continue
      }

      const position =
        typeof positionAtIndex === 'function'
          ? positionAtIndex(matchIndex)
          : lineAndColumn(text, matchIndex, startLine, startColumn)

      violations.push({
        file,
        ruleId: rule.id,
        message: rule.message,
        match: value,
        line: position.line,
        column: position.column,
      })
    }
  }

  return violations.sort(
    (left, right) =>
      left.line - right.line ||
      left.column - right.column ||
      left.ruleId.localeCompare(right.ruleId)
  )
}
