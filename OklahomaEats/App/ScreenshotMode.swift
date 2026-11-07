import Foundation
import CoreLocation
import UIKit

/// `-screenshot <name>` opens one screen with fixed state for App Store screenshots (scripts/capture-screenshots.sh).
/// Names: home, burgers, cfs, bbq, route66, honors, oldest, detail, map, saved, about.
enum ScreenshotMode {
    /// Debug builds only: an App Store build ignores the launch argument, so no one can reach seeded screens or fake locations.
    static var name: String? {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-screenshot"), i + 1 < args.count else { return nil }
        return args[i + 1]
        #else
        return nil
        #endif
    }
    static var isActive: Bool { name != nil }

    @MainActor
    static func apply(to model: AppModel) {
        guard let name, model.isLoaded else { return }
        model.filters = Filters()
        // Oklahoma City's Midtown, among the most picks, so "nearest" lists have distances without a permission prompt
        model.screenshotLocation = CLLocation(latitude: 35.4850, longitude: -97.5180)
        // by name and town, ignoring case, so a rebuild with a slightly different casing still finds the place; the hand-checked one first
        let pick = { (n: String, town: String?) -> Place? in
            let hits = model.places.filter { $0.name.caseInsensitiveCompare(n) == .orderedSame && (town == nil || $0.city == town) }
            return hits.first(where: \.handChecked) ?? hits.first
        }
        for p in [pick("Sid's Diner", "El Reno"), pick("Cattlemen's Steakhouse", "Oklahoma City"), pick("Clanton's Cafe", "Vinita")]
            .compactMap({ $0 }) where !model.isSaved(p) {
            model.toggleSaved(p)
        }
        let open = { (g: Guide) in model.tab = .guides; model.selectedGuide = g; model.guidesPath = [.guide(g)] }
        switch name {
        case "burgers": open(.burgers)
        case "cfs": open(.cfs)
        case "bbq": open(.bbq)
        case "route66": open(.route66)
        case "honors": open(.honors)
        case "oldest": open(.oldest)
        case "inspections": open(.inspections)
        case "detail":
            // Sid's Diner: El Reno onion burgers on Route 66, seen from across El Reno (about a mile off)
            model.screenshotLocation = CLLocation(latitude: 35.5312, longitude: -97.9370)
            open(.burgers)
            if let p = pick("Sid's Diner", "El Reno") ?? model.places.first {
                model.selectedPlace = p; model.guidesPath.append(.place(p))
            }
        case "map":
            // Oklahoma City from the Stockyards to Nichols Hills: five picks (Cattlemen's, Nic's Grill, Patty Wagon, Chuck House, Clark
            // Crew) as single pins; Midtown's Tucker's and Cheever's share a block and would cluster
            model.screenshotLocation = CLLocation(latitude: 35.5061, longitude: -97.5651)
            model.tab = .map
        case "saved": model.tab = .saved
        case "about": model.tab = .about
        default: model.tab = .guides; model.selectedGuide = nil
        }
        // iPad shows the place column next to every list, so give each shot a place instead of "Pick a place": a different
        // honored or hand-checked one per shot.
        guard UIDevice.current.userInterfaceIdiom == .pad, model.selectedPlace == nil else { return }
        let place: Place? = switch name {
        case "home": pick("Sid's Diner", "El Reno")
        case "burgers": pick("Johnnie's Grill", "El Reno")
        case "cfs": pick("Cheever's Cafe", "Oklahoma City")
        case "bbq": pick("Bob's Pig Shop", "Pauls Valley")
        case "route66": pick("The Rock Cafe", "Stroud")
        case "honors": pick("Florence's Restaurant", "Oklahoma City")
        case "oldest": pick("Cattlemen's Steakhouse", "Oklahoma City")
        case "inspections": nil
        case "map": pick("Nic's Grill", "Oklahoma City")
        case "saved": pick("Sid's Diner", "El Reno")
        case "about": nil
        default: pick("Sid's Diner", "El Reno")
        }
        model.selectedPlace = place
    }
}
