// Front-end behaviour for Art Jewelry.
// Analytics live in analytics.js (loaded as a module). This file only adds
// progressive-enhancement UI: scroll reveals, the sticky-nav state, scroll-spy,
// the mobile menu, and a subtle hero parallax. Everything degrades gracefully
// and respects prefers-reduced-motion. It never intercepts the contact links,
// so the data-track-link analytics keep firing untouched.

(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var finePointer = window.matchMedia("(pointer: fine)").matches;

    /* ----- Scroll reveals (one-shot) ----------------------------------- */
    var revealTargets = document.querySelectorAll("[data-reveal]");
    function revealAll() {
        revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
    }

    if (reduceMotion || !("IntersectionObserver" in window)) {
        revealAll();
    } else {
        var revealFired = false;
        var revealObserver = new IntersectionObserver(function (entries) {
            revealFired = true;
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0, rootMargin: "0px 0px -12% 0px" });

        revealTargets.forEach(function (el) { revealObserver.observe(el); });

        // Safety net: in some embedded / headless renderers the observer never
        // fires. Never leave content stranded at opacity:0 — reveal it all.
        window.setTimeout(function () { if (!revealFired) { revealAll(); } }, 1500);
    }

    /* ----- Sticky nav frosting + "past hero" state --------------------- */
    var nav = document.querySelector("[data-nav]");
    var sentinel = document.querySelector(".nav-sentinel");

    if (nav && sentinel && "IntersectionObserver" in window) {
        var navObserver = new IntersectionObserver(function (entries) {
            var past = !entries[0].isIntersecting;
            nav.classList.toggle("is-scrolled", past);
            document.body.classList.toggle("is-scrolled-past-hero", past);
        }, { rootMargin: "-40px 0px 0px 0px" });
        navObserver.observe(sentinel);
    } else if (nav) {
        // Fallback: rAF-throttled scroll listener.
        var ticking = false;
        window.addEventListener("scroll", function () {
            if (!ticking) {
                window.requestAnimationFrame(function () {
                    var past = window.scrollY > 60;
                    nav.classList.toggle("is-scrolled", past);
                    document.body.classList.toggle("is-scrolled-past-hero", past);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    /* ----- Scroll-spy: highlight the in-view section's nav link -------- */
    var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));
    var linkById = {};
    navLinks.forEach(function (link) {
        var id = (link.getAttribute("href") || "").replace("#", "");
        if (id) { linkById[id] = link; }
    });
    var spyTargets = Object.keys(linkById)
        .map(function (id) { return document.getElementById(id); })
        .filter(Boolean);

    if (spyTargets.length && "IntersectionObserver" in window) {
        var spyObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    navLinks.forEach(function (l) { l.classList.remove("is-active"); });
                    var active = linkById[entry.target.id];
                    if (active) { active.classList.add("is-active"); }
                }
            });
        }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
        spyTargets.forEach(function (el) { spyObserver.observe(el); });
    }

    /* ----- Mobile nav toggle ------------------------------------------- */
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.getElementById("nav-menu");

    function closeMenu() {
        if (!toggle) { return; }
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-open");
    }

    if (toggle && menu) {
        toggle.addEventListener("click", function () {
            var open = toggle.getAttribute("aria-expanded") === "true";
            toggle.setAttribute("aria-expanded", String(!open));
            document.body.classList.toggle("nav-open", !open);
        });

        // Close when a link is chosen (CSS smooth-scroll handles the glide).
        menu.addEventListener("click", function (event) {
            if (event.target.closest("a")) { closeMenu(); }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
                closeMenu();
                toggle.focus();
            }
        });

        // Reset menu state if the viewport grows past the mobile breakpoint.
        window.matchMedia("(min-width: 769px)").addEventListener("change", function (e) {
            if (e.matches) { closeMenu(); }
        });
    }

    /* ----- Subtle hero parallax (fine pointer, motion allowed) ---------- */
    var heroArt = document.querySelector(".hero-art");
    var hero = document.querySelector(".hero");

    if (heroArt && hero && finePointer && !reduceMotion) {
        var targetX = 0, targetY = 0, curX = 0, curY = 0, rafId = null;
        var MAX_X = 14, MAX_Y = 11;

        function loop() {
            curX += (targetX - curX) * 0.08;
            curY += (targetY - curY) * 0.08;
            heroArt.style.transform = "translate3d(" + curX.toFixed(2) + "px," + curY.toFixed(2) + "px,0)";
            if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
                rafId = window.requestAnimationFrame(loop);
            } else {
                rafId = null;
            }
        }
        function kick() { if (rafId === null) { rafId = window.requestAnimationFrame(loop); } }

        hero.addEventListener("mousemove", function (event) {
            var r = hero.getBoundingClientRect();
            var nx = (event.clientX - (r.left + r.width / 2)) / (r.width / 2);
            var ny = (event.clientY - (r.top + r.height / 2)) / (r.height / 2);
            targetX = -nx * MAX_X;
            targetY = -ny * MAX_Y;
            kick();
        }, { passive: true });

        hero.addEventListener("mouseleave", function () {
            targetX = 0; targetY = 0; kick();
        });
    }

    console.log("Art Jewelry — handcrafted in Lebanon.");
})();
