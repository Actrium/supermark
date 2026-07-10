// Ported from Java nonreg/simple/Sequence*_Test.java + *_TestResult.java
//
// Each test uses the same .puml input as the Java test, runs it through
// layout_sequence(), and asserts the structural invariants that Java's
// DEBUG output verifies: element counts, spatial relationships, and
// key dimension values.

use plantuml_little::layout::sequence::layout_sequence;
use plantuml_little::style::SkinParams;

fn parse_sequence(puml: &str) -> plantuml_little::model::sequence::SequenceDiagram {
    match plantuml_little::parser::parse(puml).expect("parse failed") {
        plantuml_little::model::Diagram::Sequence(sd) => sd,
        other => panic!(
            "expected sequence diagram, got {:?}",
            std::mem::discriminant(&other)
        ),
    }
}

fn layout(puml: &str) -> plantuml_little::layout::sequence::SeqLayout {
    let sd = parse_sequence(puml);
    layout_sequence(&sd, &SkinParams::default()).expect("layout failed")
}

// ── SequenceLayout_0006 ─────────────────────────────────────────────
// Java: SequenceLayout_0006_Test.java (PR#1777c)
// Input: A -> B with note, activate/deactivate
// TestResult key elements:
//   1 participant "Test" → but actually 2 participants A, B
//   1 activation box (height = 30.0 in Java DEBUG coords)
//   2 arrow polygons, 2 arrow lines
//   2 note PATHs (body + fold)

#[test]
fn sequencelayout_0006_structure() {
    let l = layout(
        "@startuml\n\
		 A -> B : a\n\
		 note right: Note\n\
		 activate B\n\
		 B --> A : b\n\
		 deactivate B\n\
		 @enduml",
    );

    // Java TestResult: 4 participant rects (2 head + 2 tail) → 2 unique participants
    assert_eq!(l.participants.len(), 2);

    // Java TestResult: 2 arrow LINEs + 2 POLYGONs → 2 messages
    assert_eq!(l.messages.len(), 2);

    // Java TestResult: 1 activation RECTANGLE (white, sharp corners)
    // height = pt2.y - pt1.y = 96.0 - 66.0 = 30.0 (DEBUG coords)
    assert_eq!(l.activations.len(), 1);
    let act = &l.activations[0];
    let act_h = act.y_end - act.y_start;
    assert!(
        act_h > 0.0 && act_h < 100.0,
        "activation height {act_h:.1} should be reasonable (Java: 30.0)"
    );

    // Java TestResult: 1 note (2 PATHs = body + fold corner)
    assert_eq!(l.notes.len(), 1);

    // Cross-element: activation starts at msg[0].y
    assert!(
        (act.y_start - l.messages[0].y).abs() < 0.01,
        "activation starts at first message"
    );
    // Cross-element: activation ends at msg[1].y
    assert!(
        (act.y_end - l.messages[1].y).abs() < 0.01,
        "activation ends at second message"
    );

    // Cross-element: msg[0] arrow endpoint adjusted for activation (look-ahead)
    let bob_x = l.participants[1].x;
    assert!(
        l.messages[0].to_x < bob_x,
        "msg[0].to_x ({:.1}) < bob center ({:.1}): adjusted for activation",
        l.messages[0].to_x,
        bob_x
    );

    // Cross-element: msg[1] from activated B, goes left
    assert!(
        l.messages[1].from_x <= bob_x,
        "msg[1].from_x ({:.1}) <= bob center ({:.1}): starts at activation left edge",
        l.messages[1].from_x,
        bob_x
    );

    // Cross-element: note is to the right of participant B
    assert!(
        l.notes[0].x > bob_x,
        "note x ({:.1}) > bob center ({:.1})",
        l.notes[0].x,
        bob_x
    );
}

// ── SequenceLayout_0001 ─────────────────────────────────────────────
// Java: SequenceLayout_0001_Test.java
// Input: group with maxmessagesize self-message
// TestResult key elements:
//   1 participant "Test"
//   1 group frame (RECTANGLE + PATH header)
//   1 self-message (3 LINEs + 1 POLYGON)

#[test]
fn sequencelayout_0001_structure() {
    let l = layout(
		"@startuml\n\
		 skinparam {\n\
		    Maxmessagesize 200\n\
		 }\n\
		 group Grouping messages\n\
		     Test <- Test    : The group frame [now] does draw a border around the text (located on the left side), [no longer] ignores its presence, and also [no longer] ignores the presence of a line.\n\
		 end\n\
		 @enduml",
	);

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 1, "1 self-message");
    assert!(l.messages[0].is_self, "message is self");
    // Parser maps "group" keyword to FragmentStart { kind: Group }
    assert_eq!(l.fragments.len(), 1, "1 group fragment");

    // Cross-element: group encloses the message
    let msg = &l.messages[0];
    let frag = &l.fragments[0];
    assert!(frag.y < msg.y, "group starts above message");
    assert!(frag.y + frag.height > msg.y, "group ends below message");
}

// ── SequenceLayout_0002 ─────────────────────────────────────────────
// Java: SequenceLayout_0002_Test.java
// Input: two groups, each with a self-message (one ->, one <-)
// TestResult: 2 participant rects, 2 groups, 2 self-messages (6 lines)

#[test]
fn sequencelayout_0002_structure() {
    let l = layout(
        "@startuml\n\
		 group\n\
		     a -> a : This works fine\n\
		 end\n\
		 group\n\
		     a <- a : This [now works]\n\
		 end\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 1, "1 participant: a");
    assert_eq!(l.messages.len(), 2, "2 self-messages");
    assert!(l.messages[0].is_self, "msg[0] is self");
    assert!(l.messages[1].is_self, "msg[1] is self");
    assert_eq!(l.fragments.len(), 2, "2 group fragments");

    // Cross-element: each group encloses its message
    for i in 0..2 {
        assert!(
            l.fragments[i].y < l.messages[i].y,
            "group[{i}] starts above its message"
        );
        assert!(
            l.fragments[i].y + l.fragments[i].height > l.messages[i].y,
            "group[{i}] ends below its message"
        );
    }

    // Messages in order
    assert!(l.messages[1].y > l.messages[0].y, "msg[1] below msg[0]");
}

// ── SequenceLayout_0003 ─────────────────────────────────────────────
// Java: SequenceLayout_0003_Test.java
// Input: self-messages with notes on returns
// TestResult: 1 participant, 4 self-messages, 4 notes

#[test]
fn sequencelayout_0003_structure() {
    let l = layout(
        "@startuml\n\
		 Test -> Test : label 1\n\
		 note right: note 1\n\
		 Test -> Test : label 2\n\
		 note left: note 2\n\
		 Test -> Test : label 3\n\
		 note right: note 3\n\
		 Test -> Test : label 4\n\
		 note left: note 4\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 4, "4 self-messages");
    assert_eq!(l.notes.len(), 4, "4 notes");

    // All messages are self
    for (i, m) in l.messages.iter().enumerate() {
        assert!(m.is_self, "msg[{i}] is self");
    }

    // Notes alternate right/left
    assert!(!l.notes[0].is_left, "note[0] is right");
    assert!(l.notes[1].is_left, "note[1] is left");
    assert!(!l.notes[2].is_left, "note[2] is right");
    assert!(l.notes[3].is_left, "note[3] is left");

    // Messages are in y-order
    for i in 0..3 {
        assert!(
            l.messages[i + 1].y > l.messages[i].y,
            "msg[{}] below msg[{i}]",
            i + 1
        );
    }
}

// ── SequenceLayout_0006 variant: precise activation height ──────────
// Java TestResult activation RECTANGLE: height = 96.0 - 66.0 = 30.0
// The Rust layout should produce a matching activation height

#[test]
fn sequencelayout_0006_activation_height_matches_java() {
    let l = layout(
        "@startuml\n\
		 A -> B : a\n\
		 note right: Note\n\
		 activate B\n\
		 B --> A : b\n\
		 deactivate B\n\
		 @enduml",
    );

    let act = &l.activations[0];
    let height = act.y_end - act.y_start;

    // Java TestResult: activation height = 30.0 (DEBUG coords)
    // This should equal exactly one message_spacing in Rust layout
    let msg_span = l.messages[1].y - l.messages[0].y;
    assert!(
        (height - msg_span).abs() < 0.01,
        "activation height ({height:.2}) should equal message span ({msg_span:.2})"
    );
}

// ── SequenceLeftMessageAndActiveLifeLines_0003 ──────────────────────
// Java: activation with <<-- arrows
// TestResult: 1 participant "Test", 2 activations, 5 messages

#[test]
fn sequenceleftmessageandactivelifelines_0003_structure() {
    let l = layout(
		"@startuml\n\
		 skinparam {\n\
		    Maxmessagesize 200\n\
		 }\n\
		 \n\
		 activate Test\n\
		 Test <<-- Test : the arrow and text are located inside the Lifeline because they are counted from the right side of the active member's column bar (Lifeline). Which is an incorrect display, right?\n\
		 Test <<-- Test : also the arrow is not displayed correctly (issue: #1678). (I wonder if the closing of the Lifeline is displayed correctly? Should it also include the arrow before it, i.e. close after it? If not, how do I close the Life Line after the last arrow?)\n\
		 deactivate Test\n\
		 \n\
		 @enduml",
	);

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 2, "2 messages");
    assert_eq!(l.activations.len(), 1, "1 activation");

    // Both messages are self
    for (i, m) in l.messages.iter().enumerate() {
        assert!(m.is_self, "msg[{i}] is self");
    }

    // Activation encloses both messages
    let act = &l.activations[0];
    assert!(
        act.y_start <= l.messages[0].y,
        "activation starts at or before first message"
    );
    assert!(
        act.y_end >= l.messages[1].y,
        "activation ends at or after last message"
    );
}

// ── SequenceLayout_0004 ─────────────────────────────────────────────
// Java: grouped messages with unknown participant (?)
// TestResult: 5 participants (A, B, C, D, E), 1 group, 2 messages

#[test]
fn sequencelayout_0004_structure() {
    let l = layout(
        "@startuml\n\
		 participant A\n\
		 participant B\n\
		 participant C\n\
		 participant D\n\
		 participant E\n\
		 group\n\
		 A->B : M1\n\
		 B->E : M2 [Grouped]\n\
		 end\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 5, "5 participants");
    assert_eq!(l.messages.len(), 2, "2 messages");
    assert_eq!(l.fragments.len(), 1, "1 group fragment");

    // Participants in left-to-right order
    for i in 0..4 {
        assert!(
            l.participants[i + 1].x > l.participants[i].x,
            "participant[{}] right of [{}]",
            i + 1,
            i
        );
    }

    // Group fragment encloses both messages
    let frag = &l.fragments[0];
    assert!(frag.y < l.messages[0].y, "group above msg[0]");
    assert!(frag.y + frag.height > l.messages[1].y, "group below msg[1]");

    // Messages in y-order
    assert!(l.messages[1].y > l.messages[0].y, "msg[1] below msg[0]");
}

// ── SequenceLayout_0001b ────────────────────────────────────────────
// Java: SequenceLayout_0001b_Test.java (issue#1680 + note right)
// Same as 0001 but with "note right" after the self-message
// TestResult: 1 participant, 1 self-msg, 1 group fragment, 1 note (right)

#[test]
fn sequencelayout_0001b_structure() {
    let l = layout(
		"@startuml\n\
		 skinparam {\n\
		       Maxmessagesize 200\n\
		 }\n\
		 \n\
		 group Grouping messages\n\
		     Test <- Test : The group frame [now] does draw a border around the text (located on the left side), [no longer] ignores its presence, and also [no longer] ignores the presence of a line.\n\
		 note right\n\
		   A note on the self message\n\
		 endnote\n\
		 end\n\
		 @enduml",
	);

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 1, "1 self-message");
    assert!(l.messages[0].is_self, "message is self");
    assert_eq!(l.fragments.len(), 1, "1 group fragment");
    assert_eq!(l.notes.len(), 1, "1 note");

    // Cross-element: note is on the right side
    assert!(!l.notes[0].is_left, "note is right");

    // Cross-element: note x is to the right of participant
    let part_x = l.participants[0].x;
    assert!(
        l.notes[0].x > part_x,
        "note x ({:.1}) > participant center ({:.1})",
        l.notes[0].x,
        part_x
    );

    // Cross-element: group fragment encloses the message
    let frag = &l.fragments[0];
    assert!(frag.y < l.messages[0].y, "group above message");
    assert!(
        frag.y + frag.height > l.messages[0].y,
        "group below message"
    );
}

// ── SequenceLayout_0001c ────────────────────────────────────────────
// Java: SequenceLayout_0001c_Test.java (issue#1680 + note left)
// Same as 0001b but with "note left"
// TestResult: 1 participant, 1 self-msg, 1 group fragment, 1 note (left)

#[test]
fn sequencelayout_0001c_structure() {
    let l = layout(
		"@startuml\n\
		 skinparam {\n\
		       Maxmessagesize 200\n\
		 }\n\
		 \n\
		 group Grouping messages\n\
		     Test <- Test : The group frame [now] does draw a border around the text (located on the left side), [no longer] ignores its presence, and also [no longer] ignores the presence of a line.\n\
		 note left\n\
		   A note on the self message\n\
		 endnote\n\
		 end\n\
		 @enduml",
	);

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 1, "1 self-message");
    assert!(l.messages[0].is_self, "message is self");
    assert_eq!(l.fragments.len(), 1, "1 group fragment");
    assert_eq!(l.notes.len(), 1, "1 note");

    // Cross-element: note is on the left side
    assert!(l.notes[0].is_left, "note is left");

    // Cross-element: note x is to the left of participant
    let part_x = l.participants[0].x;
    assert!(
        l.notes[0].x + l.notes[0].width < part_x,
        "note right edge ({:.1}) < participant center ({:.1})",
        l.notes[0].x + l.notes[0].width,
        part_x
    );

    // Cross-element: group fragment encloses the message
    let frag = &l.fragments[0];
    assert!(frag.y < l.messages[0].y, "group above message");
    assert!(
        frag.y + frag.height > l.messages[0].y,
        "group below message"
    );
}

// ══════════════════════════════════════════════════════════════════════
// Teoz-mode tests (ported from Java tests requiring `!pragma teoz true`)
// ══════════════════════════════════════════════════════════════════════

// ── SequenceLayout_0005 ─────────────────────────────────────────────
#[test]
fn sequencelayout_0005_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 skinparam {\n\
		   Maxmessagesize 200\n\
		 }\n\
		 \n\
		 group Grouping messages\n\
		     Test <- Test : The group frame text.\n\
		 note right\n\
		   A note on the self message\n\
		 endnote\n\
		 end\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 1, "1 self-message");
    assert!(l.messages[0].is_self, "message is self");
    assert_eq!(l.notes.len(), 1, "1 note");
    assert!(!l.notes[0].is_left, "note is right");
    assert_eq!(l.fragments.len(), 1, "1 group fragment");

    let part_x = l.participants[0].x;
    assert!(
        l.notes[0].x > part_x,
        "note x ({:.1}) > participant ({:.1})",
        l.notes[0].x,
        part_x
    );
}

// ── SequenceLayout_0005b ────────────────────────────────────────────
#[test]
fn sequencelayout_0005b_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 skinparam {\n\
		   Maxmessagesize 200\n\
		 }\n\
		 \n\
		 group Grouping messages\n\
		     Test <- Test : The group frame text.\n\
		 note left\n\
		   A note on the self message\n\
		 endnote\n\
		 end\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 1, "1 participant: Test");
    assert_eq!(l.messages.len(), 1, "1 self-message");
    assert_eq!(l.notes.len(), 1, "1 note");
    assert!(l.notes[0].is_left, "note is left");
    assert_eq!(l.fragments.len(), 1, "1 group fragment");
}

// ── SequenceArrows_0001 (simplified) ────────────────────────────────
#[test]
fn sequencearrows_0001_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 participant Jim as j\n\
		 participant Alice as a\n\
		 participant Bob   as b\n\
		 participant Tom as c\n\
		 \n\
		 a ->     b : msg1\n\
		 a ->>    b : msg2\n\
		 a <-     b : msg3\n\
		 a ->     a : msg4\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 4, "4 participants");
    assert_eq!(l.messages.len(), 4, "4 messages");
    for i in 0..3 {
        assert!(
            l.participants[i + 1].x > l.participants[i].x,
            "participant[{}] right of [{}]",
            i + 1,
            i
        );
    }
    assert!(!l.messages[0].is_self);
    assert!(l.messages[3].is_self);
    for i in 0..3 {
        assert!(
            l.messages[i + 1].y > l.messages[i].y,
            "msg[{}] below msg[{i}]",
            i + 1
        );
    }
}

// ── SequenceArrows_0002 (simplified) ────────────────────────────────
#[test]
fn sequencearrows_0002_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 participant Alice as a\n\
		 participant Bob   as b\n\
		 \n\
		 a -> b : msg1\n\
		 activate b\n\
		 b -> a : msg2\n\
		 deactivate b\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 2, "2 participants");
    assert_eq!(l.messages.len(), 2, "2 messages");
    assert_eq!(l.activations.len(), 1, "1 activation");
    let act = &l.activations[0];
    assert!(
        act.y_start <= l.messages[1].y,
        "activation starts at or before msg[1]"
    );
    assert!(
        act.y_end >= l.messages[1].y,
        "activation ends at or after msg[1]"
    );
}

// ── SequenceLeftMessage_0001 (simplified) ────────────────────────────
#[test]
fn sequenceleftmessage_0001_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 Testing <- Testing : 1st self message\n\
		 note left\n\
		   A note\n\
		 endnote\n\
		 Testing <- Testing : 2nd self message\n\
		 note right\n\
		   A note\n\
		 endnote\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 1, "1 participant");
    assert_eq!(l.messages.len(), 2, "2 self-messages");
    assert_eq!(l.notes.len(), 2, "2 notes");
    assert!(l.messages[0].is_self);
    assert!(l.messages[1].is_self);
    assert!(l.notes[0].is_left, "first note is left");
    assert!(!l.notes[1].is_left, "second note is right");
}

// ── SequenceLeftMessage_0002 (simplified) ────────────────────────────
#[test]
fn sequenceleftmessage_0002_teoz_structure() {
    let l = layout(
        "@startuml\n\
		 !pragma teoz true\n\
		 participant Bob as b\n\
		 participant Alice as a\n\
		 activate a\n\
		 activate b\n\
		 a <- a : self msg\n\
		 b <- b : self msg\n\
		 deactivate b\n\
		 deactivate a\n\
		 @enduml",
    );

    assert_eq!(l.participants.len(), 2, "2 participants");
    assert_eq!(l.messages.len(), 2, "2 self-messages");
    assert_eq!(l.activations.len(), 2, "2 activations");
    assert!(l.messages[0].is_self);
    assert!(l.messages[1].is_self);
    assert!(l.messages[1].y > l.messages[0].y, "msg[1] below msg[0]");
}

// ── Issue #28: sequence group frame must not be over-wide ───────────
//
// A message whose arrow spans a non-adjacent participant (here Alice -> Log,
// which crosses Bob) must widen the TOTAL span only when needed, not every
// gap. The previous code split the message width evenly across each gap,
// which inflated the Bob -> Log gap (because Alice -> Bob was already very
// wide from "Authentication Request"). That pushed Log 13.24px to the right
// and made the alt/group frames 13.24px too wide, so labels sat flush on
// the border.
//
// Golden coordinates below are taken from official PlantUML 1.2026.7beta3
// (the SVG attached to the issue) and must match pixel-for-pixel.
const ISSUE28: &str = "@startuml\n\
Alice -> Bob: Authentication Request\n\
alt successful case\n\
  Bob -> Alice: Authentication Accepted\n\
else some kind of failure\n\
  Bob -> Alice: Authentication Failure\n\
  group My own label\n\
    Alice -> Log : Log attack start\n\
    loop 1000 times\n\
      Alice -> Bob: DNS Attack\n\
    end\n\
    Alice -> Log : Log attack end\n\
  end\n\
else Another type of failure\n\
  Bob -> Alice: Please repeat\n\
end\n\
@enduml";

/// Participant centre X positions must match official PlantUML exactly.
/// Pre-fix the third participant (Log) was ~13.24px too far right.
#[test]
fn issue28_participant_positions_match_official() {
    let l = layout(ISSUE28);
    let xs: Vec<f64> = l.participants.iter().map(|p| p.x).collect();
    assert_eq!(xs.len(), 3, "Alice, Bob, Log");

    // Official PlantUML participant-box centres (head rect x + width/2).
    let expected = [63.8335_f64, 248.1816, 298.336];
    for (i, (got, want)) in xs.iter().zip(expected.iter()).enumerate() {
        assert!(
            (got - want).abs() < 0.01,
            "participant[{i}] x = {got}, expected {want} (official PlantUML box centre)"
        );
    }

    // The Bob -> Log gap is the base spacing only; it must NOT be inflated by
    // the Alice -> Log messages crossing it. Official centre-to-centre gap
    // = 298.336 - 248.1816 = 50.1544.
    let bob_log_gap = xs[2] - xs[1];
    assert!(
        (bob_log_gap - 50.1544).abs() < 0.01,
        "Bob->Log gap = {bob_log_gap:.4}, expected 50.1544 (official base spacing)"
    );
}

/// The outermost (alt) frame width must match official PlantUML exactly.
/// Pre-fix it was 341.2046 (13.24px too wide) because Log was misplaced.
#[test]
fn issue28_alt_frame_width_matches_official() {
    use plantuml_little::model::sequence::FragmentKind;
    let l = layout(ISSUE28);

    // The outermost frame is the alt; it has the smallest x and largest width.
    let alt = l
        .fragments
        .iter()
        .find(|f| f.kind == FragmentKind::Alt)
        .expect("alt fragment present");

    assert!(
        (alt.x - 10.0).abs() < 0.01,
        "alt x = {}, expected 10.0",
        alt.x
    );
    assert!(
        (alt.width - 327.9619).abs() < 0.01,
        "alt width = {}, expected 327.9619 (official PlantUML); pre-fix was 341.2046",
        alt.width
    );
}

// ── Multi-span message gap distribution (official longest-path) ──────
//
// Official PlantUML (teoz RealLine) treats an arrow that spans several
// participants as a single difference constraint posC[hi] - posC[lo] >=
// needed, solved by longest-path: every intermediate gap keeps its base
// width and the FINAL gap absorbs the whole deficit. The pre-fix code
// distributed `needed` evenly across every gap. Golden values below are
// official PlantUML output (verified against the teoz engine, which the
// default sequence renderer mirrors).

/// 3 participants, one long Alice -> C message: gap AB stays at the base
/// spacing, gap BC absorbs the full remaining width.
#[test]
fn multispan_message_puts_deficit_in_last_gap_3p() {
    let l = layout(
        "@startuml\n\
		 participant A\n\
		 participant B\n\
		 participant C\n\
		 A -> C : XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n\
		 @enduml",
    );
    let xs: Vec<f64> = l.participants.iter().map(|p| p.x).collect();
    let gap_ab = xs[1] - xs[0];
    let gap_bc = xs[2] - xs[1];

    // gap AB is the base participant spacing (not inflated by the A->C text).
    assert!(
        (gap_ab - 33.591).abs() < 0.05,
        "gap AB = {gap_ab:.3}, expected ~33.591 (base; not inflated)"
    );
    // gap BC carries essentially the entire label width.
    assert!(
        (gap_bc - 275.394).abs() < 0.05,
        "gap BC = {gap_bc:.3}, expected ~275.394 (absorbs the deficit)"
    );
    // Pre-fix both gaps were ~154 (even split).
    assert!(
        gap_bc > gap_ab * 2.0,
        "deficit must land in the last gap, not be split evenly"
    );
}

/// 4 participants, one long Alice -> D message: gaps AB and BC stay at the
/// base spacing; only gap CD absorbs the deficit.
#[test]
fn multispan_message_puts_deficit_in_last_gap_4p() {
    let l = layout(
        "@startuml\n\
		 participant A\n\
		 participant B\n\
		 participant C\n\
		 participant D\n\
		 A -> D : XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n\
		 @enduml",
    );
    let xs: Vec<f64> = l.participants.iter().map(|p| p.x).collect();
    let gap_ab = xs[1] - xs[0];
    let gap_bc = xs[2] - xs[1];
    let gap_cd = xs[3] - xs[2];

    assert!(
        (gap_ab - 33.591).abs() < 0.05 && (gap_bc - 33.69).abs() < 0.05,
        "gaps AB={gap_ab:.3}, BC={gap_bc:.3} must stay at base spacing"
    );
    assert!(
        (gap_cd - 241.704).abs() < 0.05,
        "gap CD = {gap_cd:.3}, expected ~241.704 (absorbs the deficit)"
    );
}
