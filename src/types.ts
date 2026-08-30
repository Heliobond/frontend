// Steps of the investor click-through (see README.md's "landing → connect →
// explore → project detail → deposit → portfolio → withdraw"), one per
// top-level route under src/app. Navigation itself is handled by the Next.js
// App Router — <Link> / useRouter().push('/…') — not by this union or an
// onNav(screen) callback, which the route-based navigation has superseded.
export type Screen =
  | 'landing' // /
  | 'connect' // /connect
  | 'explore' // /explore
  | 'project' // /project/[id]
  | 'deposit' // /deposit
  | 'portfolio' // /portfolio
  | 'withdraw' // /withdraw
