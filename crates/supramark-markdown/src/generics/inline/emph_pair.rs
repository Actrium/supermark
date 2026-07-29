//! Structure similar to `*emphasis*` with configurable markers of fixed length.
//!
//! There are many structures in various markdown flavors that
//! can be implemented with this, namely:
//!
//!  - `*emphasis*` or `_emphasis_` -> `<em>emphasis</em>`
//!  - `**strong**` or `__strong__` -> `<strong>strong</strong>`
//!  - `~~strikethrough~~` -> `<s>strikethrough</s>`
//!  - `==marked==` -> `<mark>marked</mark>`
//!  - `++inserted++` -> `<ins>inserted</ins>`
//!  - `~subscript~` -> `<sub>subscript</sub>`
//!  - `^superscript^` -> `<sup>superscript</sup>`
//!
//! You add a custom structure by using [add_with] function, which takes following arguments:
//!  - `MARKER` - marker character
//!  - `LENGTH` - length of the opening/closing marker (can be 1, 2 or 3)
//!  - `CAN_SPLIT_WORD` - whether this structure can be found in the middle of the word
//!    (for example, note the difference between `foo*bar*baz` and `foo_bar_baz`
//!    in CommonMark - first one is an emphasis, second one isn't)
//!  - `md` - parser instance
//!  - `f` - function that should return your custom [Node]
//!
//! Here is an example of implementing superscript in your custom code:
//!
//! ```rust
//! use supramark_markdown::generics::inline::emph_pair;
//! use supramark_markdown::{MarkdownParser, Node, NodeValue, Renderer};
//!
//! #[derive(Debug)]
//! struct Superscript;
//! impl NodeValue for Superscript {
//!     fn render(&self, node: &Node, fmt: &mut dyn Renderer) {
//!         fmt.open("sup", &node.attrs);
//!         fmt.contents(&node.children);
//!         fmt.close("sup");
//!     }
//! }
//!
//! let md = &mut MarkdownParser::new();
//! emph_pair::add_with::<'^', 1, true>(md, || Node::new(Superscript));
//!
//! let html = md.parse("e^iπ^+1=0").render();
//! assert_eq!(html.trim(), "e<sup>iπ</sup>+1=0");
//! ```
//!
//! Note that these structures have lower priority than the rest of the rules,
//! e.g. `` *foo`bar*baz` `` is parsed as `*foo<code>bar*baz</code>`.
//!
use std::cmp::min;

use crate::common::sourcemap::SourcePos;
use crate::parser::core::CoreRule;
use crate::parser::extset::{MarkdownParserExt, NodeExt};
use crate::parser::inline::builtin::InlineParserRule;
use crate::parser::inline::{InlineRule, InlineState, Text};
use crate::{MarkdownParser, Node, NodeValue};

#[derive(Debug, Default)]
struct PairConfig<const MARKER: char> {
    inserted: bool,
    fns: [Option<fn() -> Node>; 3],
}
impl<const MARKER: char> MarkdownParserExt for PairConfig<MARKER> {}

#[derive(Debug, Default)]
struct OpenersBottom<const MARKER: char>([usize; 6]);
impl<const MARKER: char> NodeExt for OpenersBottom<MARKER> {}

#[derive(Debug, Clone)]
#[doc(hidden)]
pub struct EmphMarker {
    // Starting marker
    pub marker: char,

    // Total length of these series of delimiters.
    pub length: usize,

    // Remaining length that's not already matched to other delimiters.
    pub remaining: usize,

    // Boolean flags that determine if this delimiter could open or close
    // an emphasis.
    pub open: bool,
    pub close: bool,

    // Byte range of the still-unmatched part of this delimiter run, in
    // `InlineState::src` coordinates.
    //
    // `Node::srcmap` cannot be reused for this: it holds offsets into the *original* markdown
    // source, which is a different (and possibly longer) coordinate space. A table cell hands
    // the inline parser `_x|y_` for the source text `_x\|y_`, because the cell scanner drops
    // the backslash. Matching delimiters has to be done in `src` coordinates, and only the
    // final span is translated to source coordinates via `InlineState::get_map`.
    pub content_start: usize,
    pub content_end: usize,
}

// this node is supposed to be replaced by actual emph or text node
impl NodeValue for EmphMarker {}

pub fn add_with<const MARKER: char, const LENGTH: u8, const CAN_SPLIT_WORD: bool>(
    md: &mut MarkdownParser,
    f: fn() -> Node,
) {
    let pair_config = md.ext.get_or_insert_default::<PairConfig<MARKER>>();
    pair_config.fns[LENGTH as usize - 1] = Some(f);

    if !pair_config.inserted {
        pair_config.inserted = true;
        md.inline
            .add_rule::<EmphPairScanner<MARKER, CAN_SPLIT_WORD>>();
    }

    if !md.has_rule::<FragmentsJoin>() {
        md.add_rule::<FragmentsJoin>()
            .before_all()
            .after::<InlineParserRule>();
    }
}

#[doc(hidden)]
pub struct EmphPairScanner<const MARKER: char, const CAN_SPLIT_WORD: bool>;
impl<const MARKER: char, const CAN_SPLIT_WORD: bool> InlineRule
    for EmphPairScanner<MARKER, CAN_SPLIT_WORD>
{
    const MARKER: char = MARKER;

    // this rule works on a closing marker, so for technical reasons any rules trying to skip it
    // should see just plain text
    fn check(_: &mut InlineState) -> Option<usize> {
        None
    }

    fn run(state: &mut InlineState) -> Option<(Node, usize)> {
        let mut chars = state.src[state.pos..state.pos_max].chars();
        if chars.next().unwrap() != MARKER {
            return None;
        }

        let scanned = state.scan_delims(state.pos, CAN_SPLIT_WORD);
        let content_end = state.pos + scanned.length;
        let mut node = Node::new(EmphMarker {
            marker: MARKER,
            length: scanned.length,
            remaining: scanned.length,
            open: scanned.can_open,
            close: scanned.can_close,
            content_start: state.pos,
            content_end,
        });
        node.srcmap = state.get_map(state.pos, content_end);
        let token_start;
        (node, token_start) = scan_and_match_delimiters::<MARKER>(state, node);

        // Backtrack to keep correct source maps: `InlineParser::tokenize` overwrites the srcmap
        // of whatever we return with `get_map(state.pos - len, state.pos)`. So `len` has to be
        // the token's length in `state.src` coordinates, and `state.pos` has to end up just
        // past the closing marker run.
        state.pos = content_end;
        debug_assert!(token_start <= state.pos);
        let token_len = state.pos - token_start;
        state.pos -= token_len;
        Some((node, token_len))
    }
}

/// Assuming last token is a closing delimiter we just inserted,
/// try to find opener(s). If any are found, move stuff to nested emph node.
///
/// Returns the token to hand back to the tokenizer, plus that token's start offset in
/// `InlineState::src` coordinates (see [`EmphMarker::content_start`]).
fn scan_and_match_delimiters<const MARKER: char>(
    state: &mut InlineState,
    mut closer_token: Node,
) -> (Node, usize) {
    let mut closer = closer_token.cast::<EmphMarker>().unwrap().clone();
    // Start of the closer run before any of it gets matched; also the fallback token start for
    // every path that leaves the run untouched.
    let unmatched_token_start = closer.content_start;

    if state.node.children.is_empty() {
        return (closer_token, unmatched_token_start);
    } // must have at least opener and closer

    if !closer.close {
        return (closer_token, unmatched_token_start);
    }

    // Previously calculated lower bounds (previous fails)
    // for each marker, each delimiter length modulo 3,
    // and for whether this closer can be an opener;
    // https://github.com/commonmark/cmark/commit/34250e12ccebdc6372b8b49c44fab57c72443460
    let openers_for_marker = state
        .node
        .ext
        .get_or_insert_default::<OpenersBottom<MARKER>>();
    let openers_parameter = (closer.open as usize) * 3 + closer.length % 3;

    let min_opener_idx = openers_for_marker.0[openers_parameter];

    let mut idx = state.node.children.len() - 1;
    let mut new_min_opener_idx = idx;
    // Start of the most recently created emph node, in `state.src` coordinates.
    let mut matched_token_start = unmatched_token_start;
    while idx > min_opener_idx {
        idx -= 1;

        let Some(opener) = state.node.children[idx].cast::<EmphMarker>() else {
            continue;
        };

        let mut opener = opener.clone();
        if opener.open && opener.marker == closer.marker && !is_odd_match(&opener, &closer) {
            while closer.remaining > 0 && opener.remaining > 0 {
                let max_marker_len = min(3, min(opener.remaining, closer.remaining));
                let mut matched_rule = None;
                let fns = &state.md.ext.get::<PairConfig<MARKER>>().unwrap().fns;
                for marker_len in (1..=max_marker_len).rev() {
                    if let Some(f) = fns[marker_len - 1] {
                        matched_rule = Some((marker_len, f));
                        break;
                    }
                }

                // If matched_fn isn't found, it can only mean that function is defined for larger marker
                // than we have (e.g. function defined for **, we have *).
                // Treat this as "marker not found".
                if matched_rule.is_none() {
                    break;
                }

                let (marker_len, marker_fn) = matched_rule.unwrap();

                closer.remaining -= marker_len;
                opener.remaining -= marker_len;

                // Cut marker_len bytes off the start of the closer run ("12345" -> "345") and
                // off the end of the opener run ("12345" -> "123"). Markers are always ASCII,
                // so byte and char counts agree. The emph node then spans exactly the gap the
                // two cuts opened up.
                closer.content_start += marker_len;
                opener.content_end -= marker_len;

                // All three spans are in `state.src` coordinates and are translated to source
                // coordinates here, exactly once. Computed before taking a mutable borrow of
                // `state.node`.
                let closer_map = state.get_map(closer.content_start, closer.content_end);
                let opener_map = state.get_map(opener.content_start, opener.content_end);
                let new_token_map = state.get_map(opener.content_end, closer.content_start);

                closer_token.srcmap = closer_map;

                let mut new_token = marker_fn();
                new_token.children = state.node.children.split_off(idx + 1);
                new_token.srcmap = new_token_map;

                state.node.children.last_mut().unwrap().srcmap = opener_map;

                // remove empty node as a small optimization so we can do less work later
                if opener.remaining == 0 {
                    state.node.children.pop();
                }

                new_min_opener_idx = 0;
                matched_token_start = opener.content_end;
                state.node.children.push(new_token);
            }
        }

        if opener.remaining > 0 {
            state.node.children[idx].replace(opener);
        } // otherwise node was already deleted
    }

    if new_min_opener_idx != 0 {
        // If match for this delimiter run failed, we want to set lower bound for
        // future lookups. This is required to make sure algorithm has linear
        // complexity.
        //
        // See details here:
        // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
        //
        let openers_for_marker = state
            .node
            .ext
            .get_or_insert_default::<OpenersBottom<MARKER>>();
        openers_for_marker.0[openers_parameter] = new_min_opener_idx;
    }

    // remove empty node as a small optimization so we can do less work later
    if closer.remaining > 0 {
        let token_start = closer.content_start;
        closer_token.replace(closer);
        (closer_token, token_start)
    } else {
        (state.node.children.pop().unwrap(), matched_token_start)
    }
}

fn is_odd_match(opener: &EmphMarker, closer: &EmphMarker) -> bool {
    // from spec:
    //
    // If one of the delimiters can both open and close emphasis, then the
    // sum of the lengths of the delimiter runs containing the opening and
    // closing delimiters must not be a multiple of 3 unless both lengths
    // are multiples of 3.
    //
    #[allow(clippy::collapsible_if)]
    if opener.close || closer.open {
        if (opener.length + closer.length).is_multiple_of(3) {
            if !opener.length.is_multiple_of(3) || !closer.length.is_multiple_of(3) {
                return true;
            }
        }
    }

    false
}

#[doc(hidden)]
pub struct FragmentsJoin;
impl CoreRule for FragmentsJoin {
    fn run(node: &mut Node, _: &MarkdownParser) {
        node.walk_mut(|node, _| fragments_join(node));
    }
}

/// Clean up tokens after emphasis and strikethrough postprocessing:
/// merge adjacent text nodes into one and re-calculate all token levels
///
/// This is necessary because initially emphasis delimiter markers (*, _, ~)
/// are treated as their own separate text tokens. Then emphasis rule either
/// leaves them as text (needed to merge with adjacent text) or turns them
/// into opening/closing tags (which messes up levels inside).
///
fn fragments_join(node: &mut Node) {
    // replace all emph markers with text tokens
    for token in node.children.iter_mut() {
        if let Some(data) = token.cast::<EmphMarker>() {
            let content = data.marker.to_string().repeat(data.remaining);
            token.replace(Text { content });
        }
    }

    // collapse adjacent text tokens
    for idx in 1..node.children.len() {
        let (tokens1, tokens2) = node.children.split_at_mut(idx);

        let token1 = tokens1.last_mut().unwrap();
        let Some(t1_data) = token1.cast_mut::<Text>() else {
            continue;
        };

        let token2 = tokens2.first_mut().unwrap();
        let Some(t2_data) = token2.cast_mut::<Text>() else {
            continue;
        };

        // concat contents
        let t2_content = std::mem::take(&mut t2_data.content);
        t1_data.content += &t2_content;

        // adjust source maps
        if let Some(map1) = token1.srcmap {
            if let Some(map2) = token2.srcmap {
                token1.srcmap = Some(SourcePos::new(
                    map1.get_byte_offsets().0,
                    map2.get_byte_offsets().1,
                ));
            }
        }

        node.children.swap(idx - 1, idx);
    }

    // remove all empty tokens
    node.children.retain(|token| {
        if let Some(data) = token.cast::<Text>() {
            !data.content.is_empty()
        } else {
            true
        }
    });
}
