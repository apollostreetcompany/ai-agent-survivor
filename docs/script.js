document.documentElement.classList.add("js-enabled");

for (const el of document.querySelectorAll(".reveal-on-load")) {
  requestAnimationFrame(() => {
    el.classList.add("is-visible");
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.18 },
  );

  for (const el of document.querySelectorAll(".reveal")) {
    observer.observe(el);
  }
} else {
  for (const el of document.querySelectorAll(".reveal")) {
    el.classList.add("is-visible");
  }
}
