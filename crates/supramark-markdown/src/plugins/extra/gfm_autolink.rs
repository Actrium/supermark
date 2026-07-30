//! GFM autolink extension — bare `www.`, scheme (`http://`/`https://`/`ftp://`)
//! and email autolinking, ported from cmark-gfm 0.29's `extensions/autolink.c`
//! so trailing-punctuation, paren-balancing, `<` truncation, `&entity;`
//! truncation and `mailto:`/`xmpp:` rewind all match GitHub's output exactly.
//!
//! Unlike the CommonMark `<url>` autolink (a separate inline rule), the GFM
//! extension runs as a postprocess over already-parsed text nodes: emphasis,
//! images and other inline constructs apply first, then URLs inside the
//! resulting text are linkified (matching cmark-gfm's own postprocess pass).
use crate::parser::core::CoreRule;
use crate::parser::inline::{Text, TextSpecial};
use crate::supramark::{AstV2Ctx, SupramarkNode};
use crate::{MarkdownParser, Node, NodeValue, Renderer};

#[derive(Debug)]
pub struct GfmAutolink {
    pub url: String,
}

impl NodeValue for GfmAutolink {
    fn to_ast_v2(
        &self,
        node: &Node,
        ctx: &AstV2Ctx<'_>,
    ) -> Option<Vec<SupramarkNode>> {
        Some(vec![SupramarkNode::Link {
            url: self.url.clone(),
            title: None,
            children: ctx.map_children(&node.children),
            position: ctx.position(node),
        }])
    }

    fn render(&self, node: &Node, fmt: &mut dyn Renderer) {
        let mut attrs = node.attrs.clone();
        attrs.push(("href", self.url.clone()));
        fmt.open("a", &attrs);
        fmt.contents(&node.children);
        fmt.close("a");
    }
}

pub fn add(md: &mut MarkdownParser) {
    md.add_rule::<GfmAutolinkPostprocess>().after_all();
}

#[doc(hidden)]
pub struct GfmAutolinkPostprocess;
impl CoreRule for GfmAutolinkPostprocess {
    fn run(root: &mut Node, md: &MarkdownParser) {
        process_node(root, false, md);
    }
}

/// Walk the tree, linkifying text nodes that are not inside a link/image.
fn process_node(node: &mut Node, in_link: bool, md: &MarkdownParser) {
    let is_link = node.name().ends_with("Link") || node.name().ends_with("Autolink");
    let child_in_link = in_link || is_link;
    let mut i = 0;
    while i < node.children.len() {
        if !child_in_link {
            if let Some(text) = node.children[i].cast::<Text>() {
                let content = text.content.clone();
                if let Some(splice) = autolink_split(&content, md) {
                    node.children.splice(i..=i, splice);
                    // Re-scan from the new node at index i (the trailing text
                    // fragment, if any) so consecutive URLs are linkified.
                    continue;
                }
            }
        }
        process_node(&mut node.children[i], child_in_link, md);
        i += 1;
    }
}

/// Outcome of scanning one text node: a list of replacement nodes (text +
/// link fragments) that splice in place of the original.
fn autolink_split(content: &str, md: &MarkdownParser) -> Option<Vec<Node>> {
    let bytes = content.as_bytes();
    let mut out: Vec<Node> = Vec::new();
    let mut text_start = 0usize;
    let mut i = 0usize;
    while i < bytes.len() {
        let m = match_next(bytes, i);
        let Some(m) = m else {
            i += 1;
            continue;
        };
        // flush text before the match
        if m.start > text_start {
            push_text(&mut out, &content[text_start..m.start]);
        } else if m.start < text_start {
            // match rewinds into already-flushed text — shouldn't happen, but
            // bail to avoid corrupting the tree.
            return None;
        }
        push_link(&mut out, &m.url, &m.display, md);
        text_start = m.end;
        i = m.end;
    }
    if out.is_empty() {
        return None;
    }
    if text_start < bytes.len() {
        push_text(&mut out, &content[text_start..]);
    }
    // Drop empty trailing/leading text nodes that cmark-gfm would also drop.
    out.retain(|n| !(n.cast::<Text>().is_some_and(|t| t.content.is_empty())));
    Some(out)
}

struct Match {
    start: usize,
    end: usize,
    url: String,
    display: String,
}

fn push_text(out: &mut Vec<Node>, s: &str) {
    let mut node = Node::new(Text {
        content: s.to_owned(),
    });
    node.srcmap = None;
    out.push(node);
}

fn push_link(out: &mut Vec<Node>, url: &str, display: &str, md: &MarkdownParser) {
    let full_url = md.link_formatter.normalize_link(url);
    if md.link_formatter.validate_link(&full_url).is_none() {
        // Disallowed protocol: render as plain text instead of a link.
        push_text(out, display);
        return;
    }
    let inner = Node::new(TextSpecial {
        content: display.to_owned(),
        markup: display.to_owned(),
        info: "autolink",
    });
    let mut node = Node::new(GfmAutolink {
        url: full_url,
    });
    node.children.push(inner);
    out.push(node);
}

fn match_next(bytes: &[u8], i: usize) -> Option<Match> {
    // cmark-gfm triggers www at 'w', url at ':' (scheme://), email at '@'.
    let b = bytes[i];
    if b == b'w' && bytes.get(i..i + 4) == Some(b"www.") {
        return www_match(bytes, i);
    }
    if b == b':' && bytes.get(i + 1) == Some(&b'/') && bytes.get(i + 2) == Some(&b'/') {
        return url_match(bytes, i);
    }
    if b == b'@' {
        return email_match(bytes, i);
    }
    None
}

// ---- www ---------------------------------------------------------------

fn www_match(data: &[u8], www_pos: usize) -> Option<Match> {
    // preceding char must be whitespace, start-of-string, or one of *_~(
    if www_pos > 0 {
        let prev = data[www_pos - 1];
        let ok = is_space(prev) || matches!(prev, b'*' | b'_' | b'~' | b'(');
        if !ok {
            return None;
        }
    }
    let rest = &data[www_pos..];
    if rest.len() < 4 || &rest[..4] != b"www." {
        return None;
    }
    let domain_end = check_domain(rest, false)?;
    let mut link_end = domain_end;
    while link_end < rest.len() && !is_space(rest[link_end]) && rest[link_end] != b'<' {
        link_end += 1;
    }
    link_end = autolink_delim(rest, link_end);
    if link_end == 0 {
        return None;
    }
    let matched = std::str::from_utf8(&rest[..link_end]).ok()?;
    let url = format!("http://{}", matched);
    Some(Match {
        start: www_pos,
        end: www_pos + link_end,
        url,
        display: matched.to_owned(),
    })
}

// ---- scheme url ---------------------------------------------------------

fn url_match(data: &[u8], colon_pos: usize) -> Option<Match> {
    // rewind alpha scheme chars before ':'
    let mut rewind = 0usize;
    while colon_pos > rewind {
        let c = data[colon_pos - rewind - 1];
        if c.is_ascii_alphabetic() {
            rewind += 1;
        } else {
            break;
        }
    }
    if rewind == 0 {
        return None;
    }
    let scheme_start = colon_pos - rewind;
    let scheme = &data[scheme_start..colon_pos];
    if !is_safe_scheme(scheme) {
        return None;
    }
    let after = &data[colon_pos..];
    // cmark-gfm requires a valid host char immediately after "://".
    if after.len() <= 3 || !is_valid_hostchar(after[3]) {
        return None;
    }
    // after begins with "://"
    let mut link_end = 3; // "://"
    let domain_part = &after[link_end..];
    let domain_len = check_domain(domain_part, true)?;
    link_end += domain_len;
    while link_end < after.len() && !is_space(after[link_end]) && after[link_end] != b'<' {
        link_end += 1;
    }
    link_end = autolink_delim(after, link_end);
    if link_end == 0 {
        return None;
    }
    let matched = std::str::from_utf8(&data[scheme_start..colon_pos + link_end]).ok()?;
    Some(Match {
        start: scheme_start,
        end: colon_pos + link_end,
        url: matched.to_owned(),
        display: matched.to_owned(),
    })
}

fn is_safe_scheme(scheme: &[u8]) -> bool {
    scheme.eq_ignore_ascii_case(b"http")
        || scheme.eq_ignore_ascii_case(b"https")
        || scheme.eq_ignore_ascii_case(b"ftp")
}

// ---- email (port of postprocess_text) ----------------------------------

fn email_match(data: &[u8], at_pos: usize) -> Option<Match> {
    email_match_inner(data, at_pos, 0)
}

fn email_match_inner(data: &[u8], at_pos: usize, rewind_floor: usize) -> Option<Match> {
    let max_rewind = at_pos - rewind_floor;
    let mut rewind = 0usize;
    let mut auto_mailto = true;
    let mut is_xmpp = false;
    while rewind < max_rewind {
        let c = data[at_pos - rewind - 1];
        if c.is_ascii_alphanumeric() {
            rewind += 1;
            continue;
        }
        if matches!(c, b'.' | b'+' | b'-' | b'_') {
            rewind += 1;
            continue;
        }
        if c == b':' {
            if validate_protocol(b"mailto:", data, at_pos, rewind, max_rewind) {
                auto_mailto = false;
                rewind += 1;
                continue;
            }
            if validate_protocol(b"xmpp:", data, at_pos, rewind, max_rewind) {
                auto_mailto = false;
                is_xmpp = true;
                rewind += 1;
                continue;
            }
        }
        break;
    }
    if rewind == 0 {
        return None;
    }

    // forward scan from after '@'
    let mut np = 0usize;
    let mut link_end = 1usize; // skip '@'
    let after_at = &data[at_pos..];
    while link_end < after_at.len() {
        let c = after_at[link_end];
        if c.is_ascii_alphanumeric() {
            link_end += 1;
            continue;
        }
        if c == b'@' {
            // Found a second '@': rebase to it, forbidding rewind past the
            // char immediately after the first '@' (mirrors cmark-gfm's
            // `goto found_at` with `max_rewind = link_end - 1`).
            return email_match_inner(data, at_pos + link_end, at_pos + 1);
        }
        if c == b'.'
            && link_end < after_at.len() - 1
            && after_at[link_end + 1].is_ascii_alphanumeric()
        {
            np += 1;
            link_end += 1;
            continue;
        }
        if c == b'/' && is_xmpp {
            link_end += 1;
            continue;
        }
        if c == b'-' || c == b'_' {
            link_end += 1;
            continue;
        }
        break;
    }

    if link_end < 2 || np == 0 {
        return None;
    }
    // last char of domain must be alpha or '.'
    let last = after_at[link_end - 1];
    if !(last.is_ascii_alphabetic() || last == b'.') {
        return None;
    }

    link_end = autolink_delim(after_at, link_end);
    if link_end == 0 {
        return None;
    }

    let local_and_domain = &data[at_pos - rewind..at_pos + link_end];
    let matched = std::str::from_utf8(local_and_domain).ok()?;
    let url = if auto_mailto {
        format!("mailto:{}", matched)
    } else {
        matched.to_owned()
    };
    Some(Match {
        start: at_pos - rewind,
        end: at_pos + link_end,
        url,
        display: matched.to_owned(),
    })
}

fn validate_protocol(
    protocol: &[u8],
    data: &[u8],
    at_pos: usize,
    rewind: usize,
    max_rewind: usize,
) -> bool {
    let len = protocol.len();
    if len > max_rewind - rewind {
        return false;
    }
    let proto_start = at_pos - rewind - len;
    if &data[proto_start..proto_start + len] != protocol {
        return false;
    }
    if len == max_rewind - rewind {
        return true;
    }
    // char before protocol must be non-alphanumeric
    let prev = data[proto_start - 1];
    !prev.is_ascii_alphanumeric()
}

// ---- shared helpers (ported from cmark-gfm) -----------------------------

fn autolink_delim(data: &[u8], mut link_end: usize) -> usize {
    let mut opening = 0usize;
    let mut closing = 0usize;
    for i in 0..link_end {
        let c = data[i];
        if c == b'<' {
            link_end = i;
            break;
        } else if c == b'(' {
            opening += 1;
        } else if c == b')' {
            closing += 1;
        }
    }
    while link_end > 0 {
        match data[link_end - 1] {
            b')' => {
                if closing <= opening {
                    return link_end;
                }
                closing -= 1;
                link_end -= 1;
            }
            b'?' | b'!' | b'.' | b',' | b':' | b'*' | b'_' | b'~' | b'\'' | b'"' => {
                link_end -= 1;
            }
            b';' => {
                let mut new_end = link_end - 2;
                while new_end > 0 && data[new_end].is_ascii_alphabetic() {
                    new_end -= 1;
                }
                if new_end < link_end - 2 && data[new_end] == b'&' {
                    link_end = new_end;
                } else {
                    link_end -= 1;
                }
            }
            _ => return link_end,
        }
    }
    link_end
}

fn check_domain(data: &[u8], allow_short: bool) -> Option<usize> {
    let mut np = 0usize;
    let mut uscore1 = 0usize;
    let mut uscore2 = 0usize;
    let size = data.len();
    let mut i = 1usize;
    while i < size - 1 {
        let c = data[i];
        if c == b'\\' && i < size - 2 {
            i += 1;
        }
        if c == b'_' {
            uscore2 += 1;
        } else if c == b'.' {
            uscore1 = uscore2;
            uscore2 = 0;
            np += 1;
        } else if !is_valid_hostchar(c) && c != b'-' {
            break;
        }
        i += 1;
    }
    if uscore1 > 0 || uscore2 > 0 {
        if np <= 10 {
            return None;
        }
    }
    if allow_short {
        Some(i)
    } else {
        if np > 0 {
            Some(i)
        } else {
            None
        }
    }
}

fn is_valid_hostchar(b: u8) -> bool {
    if b < 0x80 {
        return !is_space(b) && !is_punct(b);
    }
    // Non-ASCII: lead bytes (>=0xC0) decode to a codepoint that is neither
    // space nor punctuation (emoji, letters), so they are valid host chars;
    // continuation bytes (0x80-0xBF) are an invalid start -> not valid,
    // matching cmark_utf8proc_iterate returning an error.
    b >= 0xC0
}

fn is_space(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b'\r' | 0x0b | 0x0c)
}

fn is_punct(b: u8) -> bool {
    matches!(
        b,
        b'!' | b'"'
            | b'#'
            | b'$'
            | b'%'
            | b'&'
            | b'\''
            | b'('
            | b')'
            | b'*'
            | b'+'
            | b','
            | b'-'
            | b'.'
            | b'/'
            | b':'
            | b';'
            | b'<'
            | b'='
            | b'>'
            | b'?'
            | b'@'
            | b'['
            | b'\\'
            | b']'
            | b'^'
            | b'_'
            | b'`'
            | b'{'
            | b'|'
            | b'}'
            | b'~'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // The matchers are unit-tested directly; the full HTML pipeline is
    // exercised end-to-end by the cmark-gfm conformance suite (spec-0621..0631,
    // extensions-0019) and by public_api.rs.

    #[test]
    fn www_basic() {
        let m = www_match(b"www.commonmark.org", 0).unwrap();
        assert_eq!(m.url, "http://www.commonmark.org");
        assert_eq!(m.display, "www.commonmark.org");
        assert_eq!(m.end, 18);
    }

    #[test]
    fn www_trailing_dot_stripped() {
        // "www.commonmark.org." -> link "www.commonmark.org", "." stays
        let m = www_match(b"www.commonmark.org.", 0).unwrap();
        assert_eq!(m.display, "www.commonmark.org");
        assert_eq!(m.end, 18);
    }

    #[test]
    fn www_paren_balanced() {
        let m = www_match(b"www.google.com/search?q=Markup+(business)", 0).unwrap();
        assert_eq!(m.display, "www.google.com/search?q=Markup+(business)");
    }

    #[test]
    fn www_lt_truncates() {
        let m = www_match(b"www.commonmark.org/he<lp", 0).unwrap();
        assert_eq!(m.display, "www.commonmark.org/he");
        assert_eq!(m.end, 21); // stops before '<'
    }

    #[test]
    fn www_entity_truncates() {
        let m = www_match(b"www.google.com/search?q=commonmark&hl;", 0).unwrap();
        assert_eq!(m.display, "www.google.com/search?q=commonmark");
    }

    #[test]
    fn www_preceding_paren_ok() {
        // "(www.google.com)" -> preceding '(' is allowed
        let m = www_match(b"(www.google.com/search?q=Markup+(business))", 1).unwrap();
        assert_eq!(m.display, "www.google.com/search?q=Markup+(business)");
    }

    #[test]
    fn www_preceding_word_rejected() {
        assert!(www_match(b"foo.www.commonmark.org", 4).is_none());
    }

    #[test]
    fn url_http() {
        let m = url_match(b"http://commonmark.org", 4).unwrap();
        assert_eq!(m.url, "http://commonmark.org");
        assert_eq!(m.start, 0);
    }

    #[test]
    fn url_paren_in_path() {
        let m = url_match(b"https://encrypted.google.com/search?q=Markup+(business)", 5).unwrap();
        assert_eq!(m.url, "https://encrypted.google.com/search?q=Markup+(business)");
    }

    #[test]
    fn email_basic() {
        let m = email_match(b"foo@bar.baz", 3).unwrap();
        assert_eq!(m.url, "mailto:foo@bar.baz");
        assert_eq!(m.display, "foo@bar.baz");
    }

    #[test]
    fn email_trailing_dot_stripped() {
        let m = email_match(b"a.b-c_d@a.b.", 7).unwrap();
        assert_eq!(m.display, "a.b-c_d@a.b");
    }

    #[test]
    fn email_trailing_dash_rejected() {
        // "a.b-c_d@a.b-" -> last char '-' not alpha/'.' -> no match
        assert!(email_match(b"a.b-c_d@a.b-", 7).is_none());
    }

    #[test]
    fn email_mailto_prefix() {
        // "mailto:scyther@pokemon.com" -> '@' at index 14
        let m = email_match(b"mailto:scyther@pokemon.com", 14).unwrap();
        assert_eq!(m.url, "mailto:scyther@pokemon.com");
        assert_eq!(m.display, "mailto:scyther@pokemon.com");
    }

    #[test]
    fn email_xmpp_prefix() {
        // "xmpp:scyther@pokemon.com" -> '@' at index 12
        let m = email_match(b"xmpp:scyther@pokemon.com", 12).unwrap();
        assert!(m.url.starts_with("xmpp:"));
        assert_eq!(m.display, "xmpp:scyther@pokemon.com");
    }

    #[test]
    fn email_mmmmail_no_protocol() {
        // "mmmmailto:scyther@pokemon.com" -> char before "mailto:" is 'm' (alnum)
        // -> validate_protocol fails -> auto_mailto stays true -> only the bare
        // email is matched, "mmmmailto:" stays as text. '@' at index 17.
        let m = email_match(b"mmmmailto:scyther@pokemon.com", 17).unwrap();
        assert_eq!(m.url, "mailto:scyther@pokemon.com");
        assert_eq!(m.display, "scyther@pokemon.com");
    }
}
