// Oklahoma Eats icon concepts (2026-11-06), drawn in the shared Eats Ranked style (state-prompts/ICON-STYLE.md): one flat, level,
// centred food on a plain background in the state palette (sky blue #00559B, red dirt #9C3D23, wheat #F4EBD6), no backing shape, no
// text or texture; no school colours or marks (no OU crimson and cream, no OSU orange), no Osage shield, no tribal designs.
// Food hexes: bun #D9A441, patty #6B3E26, seared onion #F2E3B3, onion edge #C98B3A; fried steak #C8893A, crust #DDA556, gravy #F7F1E3;
// pie crust #D9A441, filling #7A3E1E, pecans #A9652F.
//   A  an El Reno fried onion burger, side view, seared onion strands between patty and bun, on sky blue
//   B  a chicken-fried steak under a pool of cream gravy, on red dirt
//   C  a slice of pecan pie (the state meal's dessert), seen from above, on sky blue
// Usage, from ok-eats/: swift scripts/icon-concepts.swift <out dir>   -> concept-{a,b,c}-1024.png
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
let SKY: UInt32 = 0x00559B, DIRT: UInt32 = 0x9C3D23, WHEAT: UInt32 = 0xF4EBD6
let BUN: UInt32 = 0xD9A441, PATTY: UInt32 = 0x6B3E26, ONION: UInt32 = 0xF2E3B3, ONION2: UInt32 = 0xC98B3A
let FRY: UInt32 = 0xC8893A, CRUST: UInt32 = 0xDDA556, GRAVY: UInt32 = 0xF7F1E3
let PIECRUST: UInt32 = 0xD9A441, FILL: UInt32 = 0x7A3E1E, PECAN: UInt32 = 0xA9652F

func R(_ s: CGFloat, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> CGPath {
    CGPath(roundedRect: CGRect(x: x * s, y: y * s, width: w * s, height: h * s), cornerWidth: r * s, cornerHeight: r * s, transform: nil)
}
func P(_ s: CGFloat, _ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

/// A: the onion burger. CoreGraphics y-up: bottom bun, patty, a fringe of seared onion, a domed top bun.
func onionBurger(_ c: CGContext, _ s: CGFloat) {
    c.setFillColor(rgb(BUN)); c.addPath(R(s, 0.17, 0.29, 0.66, 0.09, 0.04)); c.fillPath()          // bottom bun
    c.setFillColor(rgb(PATTY)); c.addPath(R(s, 0.15, 0.38, 0.70, 0.09, 0.045)); c.fillPath()       // patty, a little wider
    // the seared onion: a scalloped band of strands where the patty meets the top bun
    c.setFillColor(rgb(ONION2)); c.addPath(R(s, 0.16, 0.465, 0.68, 0.045, 0.0225)); c.fillPath()
    c.setFillColor(rgb(ONION))
    for i in 0..<7 {
        let x = 0.18 + CGFloat(i) * 0.093
        c.fillEllipse(in: CGRect(x: x * s, y: 0.47 * s, width: 0.085 * s, height: 0.05 * s))
    }
    // the top bun: a wide dome
    let top = CGMutablePath()
    top.move(to: P(s, 0.17, 0.52))
    top.addLine(to: P(s, 0.83, 0.52))
    top.addCurve(to: P(s, 0.50, 0.72), control1: P(s, 0.83, 0.64), control2: P(s, 0.70, 0.72))
    top.addCurve(to: P(s, 0.17, 0.52), control1: P(s, 0.30, 0.72), control2: P(s, 0.17, 0.64))
    top.closeSubpath()
    c.setFillColor(rgb(BUN)); c.addPath(top); c.fillPath()
}

/// B: a chicken-fried steak (a wide, lumpy oval of crust) with cream gravy pooled across the middle.
func chickenFriedSteak(_ c: CGContext, _ s: CGFloat) {
    let steak = CGMutablePath()
    steak.move(to: P(s, 0.15, 0.50))
    steak.addCurve(to: P(s, 0.45, 0.72), control1: P(s, 0.15, 0.64), control2: P(s, 0.30, 0.73))
    steak.addCurve(to: P(s, 0.85, 0.52), control1: P(s, 0.62, 0.71), control2: P(s, 0.86, 0.67))
    steak.addCurve(to: P(s, 0.52, 0.28), control1: P(s, 0.84, 0.36), control2: P(s, 0.68, 0.28))
    steak.addCurve(to: P(s, 0.15, 0.50), control1: P(s, 0.32, 0.28), control2: P(s, 0.15, 0.36))
    steak.closeSubpath()
    c.setFillColor(rgb(FRY)); c.addPath(steak); c.fillPath()
    c.setFillColor(rgb(CRUST)); c.fillEllipse(in: CGRect(x: 0.22 * s, y: 0.58 * s, width: 0.20 * s, height: 0.07 * s))
    // the gravy: a soft blob over the centre
    let gravy = CGMutablePath()
    gravy.move(to: P(s, 0.33, 0.50))
    gravy.addCurve(to: P(s, 0.55, 0.60), control1: P(s, 0.33, 0.58), control2: P(s, 0.44, 0.61))
    gravy.addCurve(to: P(s, 0.70, 0.46), control1: P(s, 0.66, 0.59), control2: P(s, 0.72, 0.53))
    gravy.addCurve(to: P(s, 0.50, 0.38), control1: P(s, 0.68, 0.39), control2: P(s, 0.58, 0.37))
    gravy.addCurve(to: P(s, 0.33, 0.50), control1: P(s, 0.40, 0.39), control2: P(s, 0.33, 0.43))
    gravy.closeSubpath()
    c.setFillColor(rgb(GRAVY)); c.addPath(gravy); c.fillPath()
}

/// C: a pecan pie slice from above: a wedge pointing left, its crust edge an arc on the right, pecan halves on the filling.
func pecanPie(_ c: CGContext, _ s: CGFloat) {
    c.saveGState(); defer { c.restoreGState() }
    let tip = P(s, 0.15, 0.50)
    let wedge = CGMutablePath()
    wedge.move(to: tip)
    wedge.addLine(to: P(s, 0.80, 0.25))
    wedge.addQuadCurve(to: P(s, 0.80, 0.75), control: P(s, 0.90, 0.50))
    wedge.closeSubpath()
    c.setFillColor(rgb(PIECRUST)); c.addPath(wedge); c.fillPath()
    let fill = CGMutablePath()
    fill.move(to: P(s, 0.22, 0.50))
    fill.addLine(to: P(s, 0.74, 0.30))
    fill.addQuadCurve(to: P(s, 0.74, 0.70), control: P(s, 0.82, 0.50))
    fill.closeSubpath()
    c.setFillColor(rgb(FILL)); c.addPath(fill); c.fillPath()
    c.setFillColor(rgb(PECAN))
    for (x, y) in [(0.40, 0.47), (0.52, 0.55), (0.55, 0.40), (0.66, 0.50)] as [(CGFloat, CGFloat)] {
        c.fillEllipse(in: CGRect(x: x * s, y: y * s, width: 0.09 * s, height: 0.055 * s))
    }
}

func render(_ n: Int, _ path: String, _ bg: UInt32, _ draw: (CGContext, CGFloat) -> Void) {
    let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.setFillColor(rgb(bg)); ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
    draw(ctx, CGFloat(n))
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "playbook/brand"
render(1024, out + "/concept-a-1024.png", SKY, onionBurger)
render(1024, out + "/concept-b-1024.png", DIRT, chickenFriedSteak)
render(1024, out + "/concept-c-1024.png", SKY, pecanPie)
