# Patentability Analysis: Breathe Project

> **Research, not legal advice. Consult a qualified IP attorney.**

---

## What Makes Something Patentable?

To be granted a patent, an invention must be:

1. **Novel** — Not previously known, used, or published anywhere in the world
2. **Non-obvious** — Not an obvious variation of what exists to someone skilled in the field
3. **Useful** — Has practical utility (breathing guidance clearly qualifies)
4. **Patent-eligible subject matter** — Not a pure law of nature, natural phenomenon, or abstract idea (a significant challenge for software — see Alice section below)

---

## The Core Innovation

The most distinctive and potentially patentable aspect of Breathe is its **interaction paradigm**:

> A user actively controls a real-time 3D visualization using two physical thumb sliders. The slider positions correspond directly to the physical act of breathing. Crucially, the sliders are **oriented in opposite directions** — left slider: up = exhale, down = inhale; right slider: up = inhale, down = exhale — mirroring the complementary, opposing nature of inhalation and exhalation. The combined slider values drive the shape, color, and glow of a three-dimensional morphing object in real time.

This is an **active** paradigm. The user creates the visualization through their breath. Most apps are passive: a pre-programmed animation tells you when to breathe and you follow it.

---

## Prior Art Landscape

These are the most relevant apps and products I'm aware of. A formal patent search must be conducted by a professional — this is a starting-point assessment only.

| App / Product | Mechanism | Why It Likely Doesn't Conflict |
|---|---|---|
| Apple Watch Breathe / Mindfulness | Passive bloom animation + haptic prompts | Passive — the app drives the animation, not the user. No sliders. |
| Calm, Headspace | Guided animated visuals | Passive. User follows, does not control. |
| Breathwrk | User taps to mark breath phase | Touch interaction, but no slider, no 3D morphing, no spatial gates, no real-time shape change |
| Spire Stone | Wearable automatically detects breathing | Hardware-based; no user-controlled input |
| HeartMath Inner Balance | Hardware probe biofeedback + clinical visualization | Hardware-based; clinical/HRV paradigm; entirely different |
| Muse Headband | EEG-based meditation feedback | Hardware-based; entirely different |
| Google's Breathe (Android) | Passive guided circle animation | Passive |

**Key differentiating factor:** None of these apps require the user to *actively drive a visual* with physical sliders. The shift from passive guidance to active physical control appears to be genuinely novel.

---

## Potentially Patentable Claims

These are the aspects of Breathe most worth discussing with a patent attorney:

### Claim 1 — The Dual Opposite-Orientation Slider Interaction Method

A method for breath-guided user input comprising:
- Two touch sliders oriented in opposition (one inverted relative to the other)
- Where the natural motion of the thumbs during breathing maps intuitively to both sliders simultaneously
- Where combined slider values drive real-time visual parameters (shape, color, luminosity) of a displayed 3D object

This is the strongest candidate. The opposite-orientation mechanic has a functional rationale (it mirrors the opposing nature of inhale/exhale) and creates an interaction that is physically distinctive.

### Claim 2 — Spatial Gate Breath-Timing Guidance

A method for pacing breath using spatial gates that approach the user through a 3D environment, where:
- The user must reshape a 3D object (via physical input) to fit through each gate
- Gates move at a speed calibrated to a target breath interval
- Successful passage requires matching breathing to the target pace

This gamifies breath timing in a novel way. No known app uses approaching spatial obstacles as breath-pacing cues.

### Claim 3 — Adaptive Breath-Interval Learning System

A method for gradually guiding a user toward slower breathing by:
- Measuring the user's natural breath cycle length over a set number of cycles
- Setting an initial gate interval equal to the measured natural length
- Gradually extending the interval over time to gently slow the user's breathing

The Slowing Down mode's "measure first, then adapt" approach is distinctive. It starts where the user is, rather than imposing a fixed target.

### Claim 4 — Combined System

A unified mobile application system comprising all three above methods working together. Combined claims are often where the most durable protection lies.

---

## The Alice Doctrine: The Biggest Risk for Software Patents

Since the Supreme Court's 2014 ruling in *Alice Corp. v. CLS Bank International*, US courts and the Patent Office have invalidated many software patents as mere "abstract ideas implemented on a computer." This is the primary obstacle to patenting Breathe.

### The Risk

A patent examiner could argue: "The idea of using sliders to control a visualization is abstract. Implementing it on a phone doesn't make it patentable."

### The Counter-Strategy

The goal is to anchor claims to **specific technical implementations**, not the abstract concept. For example:

- Not: "A method of guiding breathing using visual feedback"
- Better: "A method comprising: receiving continuous touch input from two capacitive touch sliders at opposite orientations; computing squash-and-stretch transformations on a 3D mesh in real time using WebGL shader parameters derived from said inputs; and rendering a spatial sequence of occluding plane pairs that approach the mesh along a Z-axis at a velocity determined by a target respiration interval"

An experienced software patent attorney drafts claims at this level of specificity. The abstract concept is not patentable; the specific technical system can be.

---

## Design Patent: The Visual Appearance

Separate from utility patents, **design patents** protect the ornamental appearance of a functional item. A design patent on Breathe could cover:

- The specific visual appearance of the Morph (rounded cube, squash-stretch aesthetic)
- The Gate egg shapes and their spatial arrangement
- The overall UI composition (slider positions, labels, central form)

Design patents are:
- Cheaper and faster than utility patents (~$2,000–$5,000 with attorney, ~1–2 years)
- Narrower in scope — protects exact appearance, not the concept
- Harder to design around (must look substantially similar to infringe)
- Often used alongside utility patents for layered protection

---

## Recommended Prior Art Search

Before meeting with an attorney, do your own searching on these databases:

| Resource | URL | Search Terms |
|---|---|---|
| Google Patents | patents.google.com | "breathing visualization slider", "biofeedback touch interface", "breath pacing mobile", "breath rhythm game" |
| USPTO Full Text | patft.uspto.gov | Same terms |
| CPC Classification | — | A61B 5/0816 (biofeedback), A63B 23/18 (breathing exercises), G06F 3/0488 (touch sliders) |
| WIPO Patentscope | patentscope.wipo.int | International patents |
| Google Play / App Store | — | Search for active apps — may reveal prior art not yet in patent DBs |

Keep a record of what you search and what you find. This helps your attorney.

---

## Bottom Line on Patentability

The dual opposite-orientation slider mechanic driving a real-time 3D form, combined with the spatial gate timing system, appears to represent a genuinely novel interaction paradigm. Whether a patent can be successfully obtained depends on:

1. Whether a thorough prior art search surfaces conflicting inventions
2. How skillfully the claims are drafted to survive Alice scrutiny
3. Whether the patent examiner agrees it's non-obvious

Given the apparent novelty, this is worth a consultation. The provisional patent path ($1,500–$3,000) is a low-cost way to establish priority while you decide whether to invest in a full patent.

---

*Last updated: June 2026*
