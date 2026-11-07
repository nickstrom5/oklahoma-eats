// Oklahoma Eats brand (final: Nick's decisions, 2026-11-07): the app icon is concept A of
// scripts/icon-concepts.swift, an El Reno fried onion burger, on sky blue; the shared Eats Ranked icon style, state-prompts/ICON-STYLE.md,
// no backing shape. No school colours or marks, no Osage shield, no tribal designs.
// Usage, from ok-eats/: swift scripts/make-brand.swift   -> OklahomaEats/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png,
// docs/ favicons and touch icons, docs/og.png. scripts/make-site.py draws the same mark as its inline SVG: change both together.
import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
func R(_ s: CGFloat, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> CGPath {
    CGPath(roundedRect: CGRect(x: x * s, y: y * s, width: w * s, height: h * s), cornerWidth: r * s, cornerHeight: r * s, transform: nil)
}
func P(_ s: CGFloat, _ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
let SKY: UInt32 = 0x00559B, DIRT: UInt32 = 0x9C3D23, WHEAT: UInt32 = 0xF4EBD6, REDBUD: UInt32 = 0xC2457A, AMBER: UInt32 = 0xB9975B
let BUN: UInt32 = 0xD9A441, PATTY: UInt32 = 0x6B3E26, ONION: UInt32 = 0xF2E3B3, ONION2: UInt32 = 0xC98B3A

/// A: the onion burger. Identical to icon-concepts.swift's concept A. CoreGraphics y-up: bottom bun, patty, a fringe of seared onion, a domed top bun.
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

func render(_ n: Int, _ path: String, background: Bool) {
    let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: background ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setShouldAntialias(true)
    if background { ctx.setFillColor(rgb(SKY)); ctx.fill(CGRect(x: 0, y: 0, width: n, height: n)) }
    onionBurger(ctx, CGFloat(n))
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
render(1024, "OklahomaEats/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png", background: true)
try? FileManager.default.createDirectory(atPath: "docs", withIntermediateDirectories: true)
for (n, name) in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")] {
    render(n, "docs/" + name, background: true)
}

/// The share image (1200 x 630): sky blue, the onion burger at the left, the name in wheat and the tagline in shield amber, and the app's
/// redbud band (Theme.swift's Stripes) along the bottom on wheat.
func og(_ path: String) {
    let W = 1200, H = 630
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setShouldAntialias(true)
    ctx.setFillColor(rgb(SKY)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    ctx.setFillColor(rgb(WHEAT)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: 92))
    let line: CGFloat = 46, r: CGFloat = 20
    ctx.setFillColor(rgb(SKY)); ctx.fill(CGRect(x: 0, y: line - 3, width: CGFloat(W), height: 6))
    let n = Int(CGFloat(W) / (r * 4.2))
    for i in 0..<n {
        let cx = (CGFloat(i) + 0.5) * CGFloat(W) / CGFloat(n)
        for k in 0..<5 {
            let a = CGFloat(k) * 2 * .pi / 5 + .pi / 2
            let px = cx + cos(a) * r * 0.52, py = line + sin(a) * r * 0.52
            ctx.setFillColor(rgb(REDBUD)); ctx.fillEllipse(in: CGRect(x: px - r * 0.52, y: py - r * 0.52, width: r * 1.04, height: r * 1.04))
        }
        ctx.setFillColor(rgb(WHEAT)); ctx.fillEllipse(in: CGRect(x: cx - r * 0.3, y: line - r * 0.3, width: r * 0.6, height: r * 0.6))
    }
    ctx.saveGState(); ctx.translateBy(x: 20, y: 100); onionBurger(ctx, 500); ctx.restoreGState()
    let ns = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = ns
    let title = NSFont(name: "AvenirNextCondensed-Heavy", size: 92) ?? NSFont.boldSystemFont(ofSize: 80)
    let sub = NSFont(name: "AvenirNextCondensed-DemiBold", size: 32) ?? NSFont.boldSystemFont(ofSize: 28)
    let cream = NSColor(srgbRed: 0xF4 / 255, green: 0xEB / 255, blue: 0xD6 / 255, alpha: 1)
    let gold = NSColor(srgbRed: 0xE8 / 255, green: 0xC9 / 255, blue: 0x8C / 255, alpha: 1)
    NSAttributedString(string: "OKLAHOMA", attributes: [.font: title, .foregroundColor: cream]).draw(at: NSPoint(x: 540, y: 390))
    NSAttributedString(string: "EATS", attributes: [.font: title, .foregroundColor: cream]).draw(at: NSPoint(x: 540, y: 296))
    NSAttributedString(string: "ONION BURGERS, BBQ & ROUTE 66", attributes: [.font: sub, .foregroundColor: gold]).draw(at: NSPoint(x: 544, y: 246))
    NSGraphicsContext.restoreGraphicsState()
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil)
    guard CGImageDestinationFinalize(d) else { fatalError("could not write \(path)") }
    print("wrote", path)
}
og("docs/og.png")
