// Heliobond — extended project-detail data for the project detail surface.
// Stands in for richer reads from the ProjectRegistry + oracle history on
// Stellar. Keyed by project id (1..6), matching HB_DATA.projects. Static and
// deterministic — no Math.random — so the click-through reads the same every
// time and the on-chain story stays honest.
/** A capital event — funding drawn from the pool to this project. */
export interface FundingEvent {
  date: string
  label: string
  amount: string
  hash: string
}

export interface ProjectDetail {
  /** 2–3 plain sentences in the brand voice. */
  story: string
  creator: {
    name: string
    verified: true
    since: '2025'
  }
  /** Oracle update histories, trending toward the project's current scores. */
  scoreHistory: {
    credit: ScorePoint[]
    green: ScorePoint[]
  }
  /** Capital events, most recent last. */
  fundingTimeline: FundingEvent[]
  /** A tasteful CSS gradient for the hero photo placeholder. */
  heroGradient: string
}
/** A single oracle score update, anchored by its on-chain tx hash. */
export interface ScorePoint {
  date: string
  value: number
  hash: string
}



export const PROJECT_DETAILS: Record<number, ProjectDetail> = {
  1: {
    story:
      'Sokoto community solar lights homes, clinics, and a grain market that ran on diesel for a generation. Local technicians keep the array running and own a share of what it earns. Every kilowatt-hour is metered and reported back to the pool.',
    creator: { name: 'Sahel Energy Cooperative', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 74, hash: 'b41a…09c7' },
        { date: 'Feb 2026', value: 76, hash: 'c5e8…2d14' },
        { date: 'Mar 2026', value: 78, hash: 'e9f2…6a8b' },
        { date: 'Apr 2026', value: 79, hash: '12d4…7c0e' },
        { date: 'May 2026', value: 81, hash: '7a3c…b1f9' },
        { date: 'Jun 2026', value: 82, hash: 'd44b…77a2' },
      ],
      green: [
        { date: 'Jan 2026', value: 84, hash: 'a01f…3b22' },
        { date: 'Feb 2026', value: 86, hash: 'f7c9…44e1' },
        { date: 'Mar 2026', value: 87, hash: '3e8d…91a0' },
        { date: 'Apr 2026', value: 88, hash: '90ab…0c3d' },
        { date: 'May 2026', value: 89, hash: 'cc12…58f4' },
        { date: 'Jun 2026', value: 91, hash: 'd44b…77a2' },
      ],
    },
    fundingTimeline: [
      { date: '12 Jan 2026', label: 'Funded from the pool', amount: '$180,000', hash: '7c1e…b8f5' },
      {
        date: '04 Mar 2026',
        label: 'Milestone draw released',
        amount: '$140,000',
        hash: '9a2d…1e07',
      },
      { date: '21 May 2026', label: 'Funded from the pool', amount: '$100,000', hash: 'a91f…3c0d' },
    ],
    heroGradient:
      'radial-gradient(120% 120% at 72% 8%, var(--solar-24), transparent 60%), linear-gradient(150deg, var(--solar-12), var(--ink-06))',
  },
  2: {
    story:
      'The Ría de Vigo tidal array turns the slow breathing of the estuary into steady power for the fishing towns along its shore. It was built to sit quietly with the rías ecosystem, not against it. Output rises and falls with the tide, and the pool tracks every cycle.',
    creator: { name: 'Atlántica Mareas SCG', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 68, hash: '5d0a…77b3' },
        { date: 'Feb 2026', value: 70, hash: 'e213…9c4f' },
        { date: 'Mar 2026', value: 71, hash: 'aa90…1d6e' },
        { date: 'Apr 2026', value: 72, hash: '4c7b…83a1' },
        { date: 'May 2026', value: 73, hash: 'f0e8…22d9' },
        { date: 'Jun 2026', value: 74, hash: '6b1c…0fa4' },
      ],
      green: [
        { date: 'Jan 2026', value: 82, hash: '17ce…40b8' },
        { date: 'Feb 2026', value: 84, hash: 'd9a2…6e13' },
        { date: 'Mar 2026', value: 85, hash: '3f71…b209' },
        { date: 'Apr 2026', value: 86, hash: '8e44…1c7d' },
        { date: 'May 2026', value: 87, hash: 'cb05…99a6' },
        { date: 'Jun 2026', value: 88, hash: '21fa…7d30' },
      ],
    },
    fundingTimeline: [
      { date: '08 Dec 2025', label: 'Funded from the pool', amount: '$520,000', hash: '1f3a…c90b' },
      {
        date: '19 Feb 2026',
        label: 'Turbine expansion funded',
        amount: '$360,000',
        hash: 'bd72…4e15',
      },
      {
        date: '02 Apr 2026',
        label: 'Milestone draw released',
        amount: '$200,000',
        hash: '7e90…a3c1',
      },
      { date: '27 May 2026', label: 'Funded from the pool', amount: '$100,000', hash: '04cd…62f8' },
    ],
    heroGradient:
      'radial-gradient(130% 110% at 24% 12%, var(--solar-12), transparent 58%), linear-gradient(165deg, var(--ink-06), var(--solar-12))',
  },
  3: {
    story:
      'Atacama agrivoltaics grows shade-loving crops beneath panels in one of the driest places on earth. The panels shelter the soil; the soil cools the panels. Two harvests from one patch of desert, both verified and reported on-chain.',
    creator: { name: 'Pampa Solar Andina', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 82, hash: '9c01…b4a7' },
        { date: 'Feb 2026', value: 84, hash: 'e7d3…109f' },
        { date: 'Mar 2026', value: 85, hash: '44ab…7c2e' },
        { date: 'Apr 2026', value: 86, hash: '1d90…f83b' },
        { date: 'May 2026', value: 87, hash: 'b62c…05d1' },
        { date: 'Jun 2026', value: 88, hash: '7fa0…3e9c' },
      ],
      green: [
        { date: 'Jan 2026', value: 72, hash: '03be…91a4' },
        { date: 'Feb 2026', value: 74, hash: 'cd17…6f20' },
        { date: 'Mar 2026', value: 75, hash: '8a4e…b3d9' },
        { date: 'Apr 2026', value: 76, hash: '20f1…4c87' },
        { date: 'May 2026', value: 78, hash: 'e9b5…0a16' },
        { date: 'Jun 2026', value: 79, hash: '55cd…7e42' },
      ],
    },
    fundingTimeline: [
      { date: '15 Jan 2026', label: 'Funded from the pool', amount: '$300,000', hash: '6a2f…d18c' },
      {
        date: '10 Mar 2026',
        label: 'Irrigation milestone funded',
        amount: '$220,000',
        hash: 'f471…9b05',
      },
      { date: '30 Apr 2026', label: 'Funded from the pool', amount: '$120,000', hash: '0e93…a6d2' },
    ],
    heroGradient:
      'radial-gradient(120% 130% at 78% 6%, var(--solar-24), transparent 62%), linear-gradient(140deg, var(--solar-12), var(--ink-06))',
  },
  4: {
    story:
      'The Jämtland wind co-op is owned by the farms and villages it powers, with turbines spaced to keep the reindeer trails open. Snow, wind, and long winter nights make for some of the most reliable output in the pool. Members vote on every reinvestment.',
    creator: { name: 'Jämtland Vindkraft Ek. för.', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 85, hash: 'aa01…47cf' },
        { date: 'Feb 2026', value: 87, hash: 'd193…6b28' },
        { date: 'Mar 2026', value: 88, hash: '3c7e…0f91' },
        { date: 'Apr 2026', value: 89, hash: '92ab…d340' },
        { date: 'May 2026', value: 90, hash: 'cf05…1a6d' },
        { date: 'Jun 2026', value: 91, hash: '7b2c…e904' },
      ],
      green: [
        { date: 'Jan 2026', value: 78, hash: '11de…83b0' },
        { date: 'Feb 2026', value: 80, hash: 'e7a2…2c41' },
        { date: 'Mar 2026', value: 81, hash: '3b91…f70d' },
        { date: 'Apr 2026', value: 82, hash: '8044…9ce7' },
        { date: 'May 2026', value: 83, hash: 'caf5…16a9' },
        { date: 'Jun 2026', value: 84, hash: '20cd…d738' },
      ],
    },
    fundingTimeline: [
      { date: '20 Dec 2025', label: 'Funded from the pool', amount: '$440,000', hash: '2a3f…1b9c' },
      { date: '14 Feb 2026', label: 'Third turbine funded', amount: '$300,000', hash: 'cd92…7e05' },
      {
        date: '06 Apr 2026',
        label: 'Milestone draw released',
        amount: '$140,000',
        hash: '7f10…a2d8',
      },
      { date: '22 May 2026', label: 'Funded from the pool', amount: '$80,000', hash: '0b4d…63e1' },
    ],
    heroGradient:
      'radial-gradient(125% 115% at 20% 10%, var(--solar-12), transparent 56%), linear-gradient(170deg, var(--ink-06), var(--solar-12))',
  },
  5: {
    story:
      'Kerala micro-hydro runs a hillside stream through a small powerhouse and back to the river, lighting villages that the grid never reached. It is modest by megawatts and large by lives changed. Flow is gauged daily and the readings are public.',
    creator: { name: 'Idukki Hill Hydro Society', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 62, hash: '4d0a…91b7' },
        { date: 'Feb 2026', value: 64, hash: 'e913…7c4f' },
        { date: 'Mar 2026', value: 65, hash: 'aa70…2d6e' },
        { date: 'Apr 2026', value: 66, hash: '1c8b…43a1' },
        { date: 'May 2026', value: 68, hash: 'f2e8…02d9' },
        { date: 'Jun 2026', value: 69, hash: '6d1c…b0a4' },
      ],
      green: [
        { date: 'Jan 2026', value: 86, hash: '07ce…10b8' },
        { date: 'Feb 2026', value: 88, hash: 'd5a2…9e13' },
        { date: 'Mar 2026', value: 90, hash: '3a71…0209' },
        { date: 'Apr 2026', value: 91, hash: '8044…fc7d' },
        { date: 'May 2026', value: 92, hash: 'cb95…29a6' },
        { date: 'Jun 2026', value: 93, hash: '21aa…1d30' },
      ],
    },
    fundingTimeline: [
      { date: '28 Jan 2026', label: 'Funded from the pool', amount: '$140,000', hash: '5b2f…c81c' },
      {
        date: '18 Mar 2026',
        label: 'Powerhouse milestone funded',
        amount: '$110,000',
        hash: 'f981…4b05',
      },
      { date: '11 May 2026', label: 'Funded from the pool', amount: '$60,000', hash: '0a73…e6d2' },
    ],
    heroGradient:
      'radial-gradient(130% 120% at 74% 10%, var(--solar-12), transparent 60%), linear-gradient(155deg, var(--solar-12), var(--ink-06))',
  },
  6: {
    story:
      'The Oaxaca rooftop network turns hundreds of small roofs — homes, a bakery, a school — into one shared power plant. Neighbors who could never afford panels alone now own a slice of the whole. Each rooftop meter reports to the pool independently.',
    creator: { name: 'Techos Solares de Oaxaca', verified: true, since: '2025' },
    scoreHistory: {
      credit: [
        { date: 'Jan 2026', value: 70, hash: '8c01…54a7' },
        { date: 'Feb 2026', value: 72, hash: 'e2d3…30f9' },
        { date: 'Mar 2026', value: 73, hash: '41ab…9c2e' },
        { date: 'Apr 2026', value: 74, hash: '1f90…283b' },
        { date: 'May 2026', value: 76, hash: 'b32c…75d1' },
        { date: 'Jun 2026', value: 77, hash: '7da0…6e9c' },
      ],
      green: [
        { date: 'Jan 2026', value: 79, hash: '02be…41a4' },
        { date: 'Feb 2026', value: 81, hash: 'cf17…1f20' },
        { date: 'Mar 2026', value: 82, hash: '894e…03d9' },
        { date: 'Apr 2026', value: 83, hash: '21f1…7c87' },
        { date: 'May 2026', value: 85, hash: 'eab5…6a16' },
        { date: 'Jun 2026', value: 86, hash: '52cd…2e42' },
      ],
    },
    fundingTimeline: [
      { date: '05 Jan 2026', label: 'Funded from the pool', amount: '$240,000', hash: '3c2f…b18c' },
      {
        date: '02 Mar 2026',
        label: 'Second cluster funded',
        amount: '$180,000',
        hash: 'f271…6b05',
      },
      { date: '25 Apr 2026', label: 'Funded from the pool', amount: '$100,000', hash: '0c93…46d2' },
    ],
    heroGradient:
      'radial-gradient(120% 125% at 76% 8%, var(--solar-24), transparent 60%), linear-gradient(145deg, var(--solar-12), var(--ink-06))',
  },
}
