<?php
require __DIR__ . '/inc/core.php';
require __DIR__ . '/inc/schema.php';
require __DIR__ . '/inc/media.php';
require __DIR__ . '/inc/events.php';

$c       = ff_content();
$events  = events_upcoming();
$gallery = gallery_items();
$formUrl = $c['contact']['form_url'] ?: 'https://tally.so/r/lbE7e5';
$formId  = $c['contact']['form_id'];
$cta     = 'href="' . h($formUrl) . '"' . ($formId ? ' data-tally-open="' . h($formId) . '" data-tally-layout="modal" data-tally-width="720" data-tally-overlay="1" data-tally-auto-close="4000"' : '');
?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FIGHTFIT — Train like a fighter. | Premium Combat Fitness Basel</title>
<meta name="description" content="FIGHTFIT verbindet Striking, Grappling, Kraft und Konditionstraining zu einem intensiven Ganzkörpertraining. 12 Week Program in Basel — beginner friendly, kein Sparring, keine Vorerfahrung nötig.">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230a0a0a'/><text x='16' y='23' font-family='sans-serif' font-size='17' font-weight='700' fill='%23c9a227' text-anchor='middle'>FF</text></svg>">

<link rel="canonical" href="https://fightfit-bs.ch/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="FIGHTFIT">
<meta property="og:locale" content="de_CH">
<meta property="og:url" content="https://fightfit-bs.ch/">
<meta property="og:title" content="FIGHTFIT — Train like a fighter.">
<meta property="og:description" content="Premium Combat Fitness in Basel. Striking · Grappling · Strength · Conditioning · Mindset.">
<meta property="og:image" content="https://fightfit-bs.ch/assets/fightfit-logo.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="800">
<meta name="twitter:card" content="summary_large_image">

<script>document.documentElement.classList.add('js')</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100..125,400..900;1,100..125,400..900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

<style>
/* ─────────────────────────  TOKENS  ───────────────────────── */
:root{
  --ink:#050505;
  --ink-2:#0d0d0e;
  --ink-3:#141416;
  --line:rgba(255,255,255,.10);
  --line-strong:rgba(255,255,255,.18);
  --white:#f7f7f5;
  --mute:#a2a2a0;
  --gold:#c9a227;
  --gold-lo:#8f6f16;
  --gold-hi:#f0d98a;
  --gold-grad:linear-gradient(140deg,#f4e4ae 0%,#d4af37 38%,#a8801d 72%,#e8cf88 100%);
  --shell:min(1180px,100% - 2.5rem);
  --r:14px;
  --ease:cubic-bezier(.22,.61,.36,1);
  --display:"Archivo","Arial Narrow",system-ui,sans-serif;
  --body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
}

/* ─────────────────────────  BASE  ───────────────────────── */
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{
  margin:0;background:var(--ink);color:var(--white);
  font-family:var(--body);font-size:clamp(1rem,.96rem + .2vw,1.075rem);
  line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden;
}
img{max-width:100%;display:block;height:auto}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4{font-family:var(--display);font-weight:800;font-stretch:112%;
  line-height:.98;letter-spacing:-.01em;margin:0;text-transform:uppercase}
p{margin:0}
::selection{background:var(--gold);color:#0a0a0a}
:focus-visible{outline:2px solid var(--gold-hi);outline-offset:3px;border-radius:4px}

.shell{width:var(--shell);margin-inline:auto}
.gold{color:var(--gold)}
.gold-fill{background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}

.eyebrow{
  font-family:var(--display);font-weight:700;font-size:.75rem;font-stretch:112%;
  letter-spacing:.32em;text-transform:uppercase;color:var(--gold);
  display:flex;align-items:center;gap:.85rem;margin-bottom:1.25rem;
}
.eyebrow::before{content:"";width:34px;height:1px;background:var(--gold);opacity:.7;flex:none}
.eyebrow.is-center{justify-content:center}
.eyebrow.is-center::after{content:"";width:34px;height:1px;background:var(--gold);opacity:.7;flex:none}

.lede{color:var(--mute);max-width:58ch}
section{padding:clamp(4.5rem,9vw,8rem) 0;position:relative}

/* ─────────────────────────  BUTTONS  ───────────────────────── */
.btn{
  --bg:var(--gold-grad);
  display:inline-flex;align-items:center;justify-content:center;gap:.6rem;
  font-family:var(--display);font-weight:800;font-stretch:112%;font-size:.86rem;
  letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;
  padding:1.05rem 2.1rem;border:0;border-radius:2px;cursor:pointer;
  background:var(--bg);color:#0a0a0a;position:relative;isolation:isolate;
  transition:transform .25s var(--ease),box-shadow .25s var(--ease),filter .25s var(--ease);
  box-shadow:0 10px 34px -14px rgba(201,162,39,.85);
}
.btn:hover{transform:translateY(-2px);filter:brightness(1.07);box-shadow:0 18px 40px -14px rgba(201,162,39,.95)}
.btn:active{transform:translateY(0)}
.btn--ghost{
  background:transparent;color:var(--white);
  box-shadow:inset 0 0 0 1px var(--line-strong);
}
.btn--ghost:hover{box-shadow:inset 0 0 0 1px var(--gold);color:var(--gold-hi);filter:none}
.btn--sm{padding:.8rem 1.4rem;font-size:.74rem}

/* ─────────────────────────  HEADER  ───────────────────────── */
.hdr{
  position:fixed;inset:0 0 auto;z-index:100;
  transition:background .35s var(--ease),border-color .35s var(--ease),backdrop-filter .35s var(--ease);
  border-bottom:1px solid transparent;
}
.hdr[data-stuck]{
  background:rgba(5,5,5,.82);backdrop-filter:blur(14px) saturate(1.3);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);border-bottom-color:var(--line);
}
.hdr__in{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;
  height:74px;width:var(--shell);margin-inline:auto}
.mark{font-family:var(--display);font-weight:900;font-stretch:120%;font-style:italic;
  font-size:1.32rem;letter-spacing:.01em;text-transform:uppercase;line-height:1;white-space:nowrap}
.mark span{color:var(--gold)}
.nav{display:flex;align-items:center;gap:1.75rem}
.nav a{
  font-family:var(--display);font-weight:600;font-stretch:108%;font-size:.78rem;
  letter-spacing:.18em;text-transform:uppercase;color:var(--mute);white-space:nowrap;
  transition:color .2s var(--ease);position:relative;padding-block:.4rem;
}
.nav a::after{content:"";position:absolute;left:0;bottom:0;height:1px;width:0;
  background:var(--gold);transition:width .3s var(--ease)}
.nav a:hover{color:var(--white)}
.nav a:hover::after{width:100%}
/* two header CTAs: one for the desktop bar, one inside the mobile drawer */
.nav__cta,.hdr__cta{display:none}
@media (min-width:1240px){.hdr__cta{display:inline-flex}}

.burger{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
  width:44px;height:44px;background:none;cursor:pointer;
  border:1px solid var(--line-strong);border-radius:2px}
.burger span{display:block;width:18px;height:1.5px;background:var(--white);
  transition:transform .3s var(--ease),opacity .2s var(--ease)}
.burger[aria-expanded="true"] span:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
.burger[aria-expanded="true"] span:nth-child(2){opacity:0}
.burger[aria-expanded="true"] span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
@media (min-width:1080px){.burger{display:none}}

@media (max-width:1079px){
  .nav{
    position:fixed;inset:74px 0 0;flex-direction:column;align-items:stretch;
    justify-content:flex-start;gap:0;overflow-y:auto;overscroll-behavior:contain;
    background:rgba(5,5,5,.98);backdrop-filter:blur(16px);border-top:1px solid var(--line);
    padding:.5rem 1.25rem 2.5rem;
    clip-path:inset(0 0 100% 0);opacity:0;pointer-events:none;
    transition:clip-path .4s var(--ease),opacity .3s var(--ease);
  }
  .nav[data-open]{clip-path:inset(0 0 0 0);opacity:1;pointer-events:auto}
  .nav a{padding:1.05rem 0;border-bottom:1px solid var(--line);font-size:.95rem;letter-spacing:.14em}
  .nav a::after{display:none}
  .nav a.nav__cta{display:inline-flex;margin-top:1.4rem;border-bottom:0;color:#0a0a0a}
}

/* ─────────────────────────  HERO  ───────────────────────── */
.hero{
  min-height:88svh;display:grid;align-items:center;padding:clamp(6.5rem,12vh,9rem) 0 clamp(2.5rem,6vh,4rem);
  position:relative;overflow:clip;
}
.hero::before{
  content:"";position:absolute;inset:-20% -10% auto 30%;height:120%;z-index:0;
  background:radial-gradient(60% 55% at 60% 40%,rgba(201,162,39,.20),transparent 70%);
  filter:blur(30px);pointer-events:none;
}
.hero::after{
  content:"";position:absolute;inset:auto 0 0;height:38%;z-index:0;
  background:linear-gradient(to top,var(--ink),transparent);pointer-events:none;
}
.hero__grid{position:relative;z-index:1;display:grid;gap:clamp(2.5rem,6vw,4.5rem);align-items:center}
@media (min-width:960px){.hero__grid{grid-template-columns:1.05fr .95fr}}

.hero h1{font-size:clamp(3.1rem,10.5vw,7.1rem);font-weight:900;font-stretch:118%;font-style:italic;letter-spacing:-.02em}
.hero h1 .line{display:block}
.hero__sub{margin-top:1.6rem;font-size:clamp(1.02rem,.95rem + .5vw,1.28rem);color:var(--mute);max-width:44ch}
.hero__sub strong{color:var(--white);font-weight:600}
.hero__cta{display:flex;flex-wrap:wrap;gap:.9rem;margin-top:2.4rem}

.hero__visual{position:relative;display:grid;place-items:center;margin:0}
.hero__visual::before{
  content:"";position:absolute;width:118%;aspect-ratio:1;border-radius:50%;z-index:0;
  background:radial-gradient(circle,rgba(201,162,39,.22),rgba(201,162,39,.05) 45%,transparent 70%);
  filter:blur(18px);pointer-events:none;
}
.hero__visual img{
  position:relative;z-index:1;width:min(100%,540px);mix-blend-mode:screen;
  -webkit-mask-image:radial-gradient(ellipse 62% 62% at 50% 50%,#000 58%,transparent 100%);
  mask-image:radial-gradient(ellipse 62% 62% at 50% 50%,#000 58%,transparent 100%);
}

.facts{
  position:relative;z-index:1;margin-top:clamp(3rem,7vw,4.5rem);
  display:grid;grid-template-columns:repeat(2,1fr);gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;
}
@media (min-width:760px){.facts{grid-template-columns:repeat(4,1fr)}}
.fact{background:var(--ink-2);padding:1.5rem 1.5rem 1.65rem}
.fact dt{font-family:var(--display);font-size:.68rem;font-weight:700;font-stretch:110%;
  letter-spacing:.24em;text-transform:uppercase;color:var(--gold);margin-bottom:.5rem}
.fact dd{margin:0;font-family:var(--display);font-weight:800;font-stretch:112%;
  font-size:clamp(1.15rem,1rem + .7vw,1.5rem);text-transform:uppercase;line-height:1.1}
.fact dd small{display:block;font-family:var(--body);font-weight:400;font-size:.82rem;
  text-transform:none;color:var(--mute);letter-spacing:0;margin-top:.3rem}

/* ─────────────────────────  ABOUT  ───────────────────────── */
.about{border-top:1px solid var(--line);background:linear-gradient(180deg,var(--ink-2),var(--ink))}
.about__grid{display:grid;gap:clamp(2rem,5vw,4rem)}
@media (min-width:900px){.about__grid{grid-template-columns:.9fr 1.1fr;align-items:start}}
.about h2{font-size:clamp(2.1rem,1.5rem + 2.6vw,3.4rem)}
.about p+p{margin-top:1.15rem}
.about__body p:first-child{color:var(--white);font-size:1.12em}
.tags{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:2rem}
.tag{
  font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.72rem;
  letter-spacing:.16em;text-transform:uppercase;color:var(--gold-hi);
  border:1px solid rgba(201,162,39,.35);border-radius:999px;padding:.5rem 1.05rem;
  background:rgba(201,162,39,.06);
}

/* ─────────────────────────  PILLARS  ───────────────────────── */
.pillars{border-top:1px solid var(--line)}
.pillars__head{display:grid;gap:1.25rem;margin-bottom:clamp(2.5rem,5vw,3.75rem)}
@media (min-width:900px){.pillars__head{grid-template-columns:1fr 1fr;align-items:end}}
.pillars h2{font-size:clamp(2.1rem,1.5rem + 2.6vw,3.4rem)}
.grid5{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
@media (min-width:560px){.grid5{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1040px){.grid5{grid-template-columns:repeat(5,1fr)}}
.pillar{
  background:var(--ink-2);padding:2.15rem 1.6rem 2.35rem;position:relative;overflow:hidden;
  transition:background .35s var(--ease);
}
.pillar::before{
  content:"";position:absolute;inset:auto 0 0;height:2px;background:var(--gold-grad);
  transform:scaleX(0);transform-origin:left;transition:transform .45s var(--ease);
}
.pillar:hover{background:var(--ink-3)}
.pillar:hover::before{transform:scaleX(1)}
.pillar svg{width:40px;height:40px;stroke:var(--gold);fill:none;stroke-width:1.5;
  stroke-linecap:round;stroke-linejoin:round;margin-bottom:1.35rem;
  transition:transform .45s var(--ease)}
.pillar:hover svg{transform:translateY(-3px) scale(1.06)}
.pillar h3{font-size:1.16rem;letter-spacing:.06em;margin-bottom:.6rem}
.pillar p{color:var(--mute);font-size:.94rem;line-height:1.55}
.pillar__n{position:absolute;top:1.2rem;right:1.35rem;font-family:var(--display);
  font-weight:800;font-size:.72rem;letter-spacing:.1em;color:rgba(255,255,255,.16)}

/* ─────────────────────────  COACH  ───────────────────────── */
.coach{border-top:1px solid var(--line);background:var(--ink-2)}
.coach__grid{display:grid;gap:clamp(2.25rem,5vw,4rem);align-items:center}
@media (min-width:900px){.coach__grid{grid-template-columns:.85fr 1.15fr}}
.coach h2{font-size:clamp(2.1rem,1.5rem + 2.6vw,3.4rem);margin-bottom:.55rem}
.coach__role{
  font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.74rem;
  letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:1.6rem;
}
.coach__body p+p{margin-top:1.15rem}
.coach__quote{
  margin:2rem 0 0;padding:1.35rem 0 .25rem 1.5rem;border-left:2px solid var(--gold);
  font-family:var(--display);font-weight:600;font-stretch:108%;font-style:italic;
  font-size:clamp(1.05rem,1rem + .5vw,1.3rem);line-height:1.4;color:var(--white);
}
.creds{list-style:none;margin:2rem 0 0;padding:0;display:grid;gap:.8rem}
@media (min-width:620px){.creds{grid-template-columns:repeat(2,1fr)}}
.creds li{display:flex;gap:.75rem;align-items:flex-start;color:var(--mute);font-size:.95rem}
.creds svg{width:16px;height:16px;flex:none;margin-top:.32rem;stroke:var(--gold);fill:none;
  stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.portrait{
  position:relative;aspect-ratio:4/5;border-radius:var(--r);overflow:hidden;
  background:var(--ink-3);border:1px solid var(--line);
}
.portrait img{width:100%;height:100%;object-fit:cover}
.portrait__ph{
  position:absolute;inset:.75rem;border:1px dashed rgba(201,162,39,.45);border-radius:8px;
  display:grid;place-content:center;gap:.7rem;text-align:center;padding:1.5rem;
}
.portrait__ph svg{width:34px;height:34px;margin:0 auto;stroke:var(--gold);fill:none;
  stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.portrait__ph b{font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.72rem;
  letter-spacing:.2em;text-transform:uppercase;color:var(--gold)}
.portrait__ph span{color:var(--mute);font-size:.84rem;line-height:1.5;max-width:24ch}

/* Unersetzte Platzhalter sollen unübersehbar sein — nie versehentlich live gehen. */
.todo{
  background:rgba(201,162,39,.16);color:var(--gold-hi);
  box-shadow:inset 0 0 0 1px rgba(201,162,39,.4);
  border-radius:3px;padding:.05em .4em;font-style:normal;
}

/* ─────────────────────────  PROGRAM  ───────────────────────── */
.program{border-top:1px solid var(--line);background:linear-gradient(180deg,var(--ink),var(--ink-2))}
.offer{
  display:grid;gap:0;border:1px solid var(--line-strong);border-radius:var(--r);
  overflow:hidden;background:var(--ink-2);
  box-shadow:0 50px 110px -60px rgba(0,0,0,1);
}
@media (min-width:940px){.offer{grid-template-columns:1.12fr .88fr}}
.offer__main{padding:clamp(2rem,4vw,3.25rem)}
.offer__side{
  padding:clamp(2rem,4vw,3.25rem);background:var(--ink-3);
  border-top:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;
}
@media (min-width:940px){.offer__side{border-top:0;border-left:1px solid var(--line)}}
.offer h2{font-size:clamp(2rem,1.4rem + 2.4vw,3.1rem);margin-bottom:.9rem}
.offer h2 em{font-style:italic;font-weight:900}
.badge{
  display:inline-flex;align-items:center;gap:.5rem;margin-bottom:1.5rem;
  font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.7rem;
  letter-spacing:.2em;text-transform:uppercase;color:#0a0a0a;
  background:var(--gold-grad);padding:.42rem .85rem;border-radius:2px;
}
.specs{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:1.9rem}
@media (min-width:620px){.specs{grid-template-columns:repeat(2,1fr)}}
.specs li{background:var(--ink-3);padding:1.05rem 1.25rem;display:flex;gap:.85rem;align-items:flex-start}
.specs svg{width:17px;height:17px;flex:none;margin-top:.28rem;stroke:var(--gold);fill:none;
  stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.specs b{display:block;font-family:var(--display);font-weight:700;font-stretch:108%;
  font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:var(--mute);margin-bottom:.15rem}
.specs span{font-size:.98rem;font-weight:500}

.price{font-family:var(--display);font-weight:900;font-stretch:118%;line-height:1;
  font-size:clamp(3rem,2rem + 4.5vw,4.6rem);letter-spacing:-.02em}
.price sup{font-size:.3em;vertical-align:super;letter-spacing:.1em;font-weight:700;margin-right:.35em;color:var(--mute)}
.price-note{color:var(--mute);font-size:.92rem;margin-top:.7rem}
.offer__side .btn{width:100%;margin-top:1.9rem}
.check{list-style:none;margin:1.9rem 0 0;padding:0;display:grid;gap:.75rem}
.check li{display:flex;gap:.7rem;align-items:flex-start;color:var(--mute);font-size:.94rem}
.check svg{width:16px;height:16px;flex:none;margin-top:.3rem;stroke:var(--gold);fill:none;stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}

/* ─────────────────────────  OPEN  ───────────────────────── */
.open{border-top:1px solid var(--line)}
.open__card{
  border:1px solid var(--line);border-radius:var(--r);background:var(--ink-2);
  padding:clamp(2rem,4vw,3.25rem);display:grid;gap:2rem;align-items:center;position:relative;overflow:hidden;
}
@media (min-width:900px){.open__card{grid-template-columns:1fr auto}}
.open__card::before{
  content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--gold-grad);
}
.open h2{font-size:clamp(1.9rem,1.4rem + 2.2vw,2.9rem);margin-bottom:.85rem}
.open__meta{display:flex;flex-wrap:wrap;gap:.5rem .95rem;margin-top:1.35rem;color:var(--mute);
  font-family:var(--display);font-weight:600;font-stretch:108%;font-size:.78rem;
  letter-spacing:.16em;text-transform:uppercase}
.open__meta span{display:inline-flex;align-items:center;gap:.95rem}
.open__meta span:not(:last-child)::after{content:"";width:4px;height:4px;border-radius:50%;background:var(--gold);opacity:.75}
.open__time{font-family:var(--display);font-weight:800;font-stretch:112%;text-transform:uppercase;
  font-size:clamp(1.4rem,1.1rem + 1.2vw,2rem);white-space:nowrap}
.open__time small{display:block;font-family:var(--body);font-weight:400;font-size:.85rem;
  color:var(--mute);text-transform:none;letter-spacing:0;margin-top:.35rem}

/* ─────────────────────────  CTA BAND  ───────────────────────── */
.band{
  border-top:1px solid var(--line);text-align:center;position:relative;overflow:clip;
  background:var(--ink-2);
}
.band::before{
  content:"";position:absolute;inset:-60% 0 auto;height:200%;
  background:radial-gradient(45% 40% at 50% 50%,rgba(201,162,39,.16),transparent 70%);pointer-events:none;
}
.band__in{position:relative;z-index:1}
.band h2{font-size:clamp(2.3rem,1.5rem + 4vw,4.6rem);font-weight:900;font-stretch:118%;font-style:italic}
.band p{color:var(--mute);margin:1.4rem auto 2.4rem;max-width:46ch}

/* ─────────────────────────  FOOTER  ───────────────────────── */
.ft{border-top:1px solid var(--line);padding:clamp(3rem,6vw,4.5rem) 0 2.5rem;background:var(--ink)}
.ft__grid{display:grid;gap:2.5rem}
@media (min-width:760px){.ft__grid{grid-template-columns:1.4fr 1fr 1fr}}
.ft h4{font-size:.72rem;letter-spacing:.24em;color:var(--gold);margin-bottom:1.1rem;font-weight:700}
.ft p,.ft li{color:var(--mute);font-size:.94rem}
.ft ul{list-style:none;margin:0;padding:0;display:grid;gap:.65rem}
.ft a:hover{color:var(--gold-hi)}
.ft__claim{font-family:var(--display);font-weight:700;font-stretch:110%;font-style:italic;
  text-transform:uppercase;letter-spacing:.06em;color:var(--white);margin-top:.9rem;font-size:.95rem}
.ft__bar a{text-decoration:underline;text-underline-offset:3px}
.ft__bar{margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;justify-content:space-between;
  color:#6d6d6b;font-size:.82rem}

/* ─────────────────────────  GALERIE  ───────────────────────── */
.gallery{border-top:1px solid var(--line);background:var(--ink-2)}
.gallery__head{display:grid;gap:1.25rem;margin-bottom:clamp(2.25rem,4.5vw,3.25rem)}
@media (min-width:900px){.gallery__head{grid-template-columns:1fr 1fr;align-items:end}}
.gallery h2{font-size:clamp(2.1rem,1.5rem + 2.6vw,3.4rem)}
.shots{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:var(--r);overflow:hidden;grid-template-columns:repeat(2,1fr)}
@media (min-width:760px){.shots{grid-template-columns:repeat(3,1fr)}}
@media (min-width:1200px){.shots{grid-template-columns:repeat(4,1fr)}}
.shot{position:relative;margin:0;background:var(--ink-3);border:0;padding:0;cursor:zoom-in;
  aspect-ratio:4/3;overflow:hidden;display:block;width:100%}
.shot img{width:100%;height:100%;object-fit:cover;
  transition:transform .55s var(--ease),opacity .35s var(--ease);opacity:.88}
.shot:hover img,.shot:focus-visible img{transform:scale(1.05);opacity:1}

/* Lightbox */
.lb{position:fixed;inset:0;z-index:200;display:none;place-items:center;
  background:rgba(3,3,3,.94);backdrop-filter:blur(6px);padding:clamp(1rem,4vw,3rem)}
.lb[data-open]{display:grid}
.lb img{max-width:100%;max-height:82vh;border-radius:8px;
  box-shadow:0 40px 90px -40px rgba(0,0,0,1)}
.lb__cap{margin-top:1rem;color:var(--mute);font-size:.92rem;text-align:center}
.lb__btn{position:absolute;background:rgba(255,255,255,.06);border:1px solid var(--line-strong);
  color:var(--white);width:46px;height:46px;border-radius:50%;cursor:pointer;
  display:grid;place-items:center;font-size:1.2rem;line-height:1;transition:background .2s var(--ease)}
.lb__btn:hover{background:rgba(201,162,39,.25)}
.lb__x{top:clamp(1rem,3vw,2rem);right:clamp(1rem,3vw,2rem)}
.lb__prev{left:clamp(.5rem,2vw,2rem);top:50%;transform:translateY(-50%)}
.lb__next{right:clamp(.5rem,2vw,2rem);top:50%;transform:translateY(-50%)}

/* ─────────────────────────  TERMINE  ───────────────────────── */
.events{border-top:1px solid var(--line)}
.events__head{display:grid;gap:1.25rem;margin-bottom:clamp(2.25rem,4.5vw,3.25rem)}
@media (min-width:900px){.events__head{grid-template-columns:1fr 1fr;align-items:end}}
.events h2{font-size:clamp(2.1rem,1.5rem + 2.6vw,3.4rem)}
.agenda{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.agenda li{background:var(--ink-2);padding:1.35rem 1.5rem;display:flex;gap:1.35rem;
  align-items:center;flex-wrap:wrap;transition:background .3s var(--ease)}
.agenda li:hover{background:var(--ink-3)}
.date{flex:none;width:66px;text-align:center;border-right:1px solid var(--line);padding-right:1.1rem}
.date b{display:block;font-family:var(--display);font-weight:800;font-stretch:112%;
  font-size:1.75rem;line-height:1;font-variant-numeric:tabular-nums}
.date span{display:block;font-family:var(--display);font-weight:700;font-size:.68rem;
  letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-top:.25rem}
.ev__main{flex:1 1 15rem;min-width:0}
.ev__main strong{display:block;font-family:var(--display);font-weight:700;font-stretch:110%;
  text-transform:uppercase;letter-spacing:.03em;font-size:1.02rem;margin-bottom:.2rem}
.ev__main span{color:var(--mute);font-size:.93rem}
.ev__when{flex:none;font-family:var(--display);font-weight:700;font-stretch:108%;font-size:.76rem;
  letter-spacing:.16em;text-transform:uppercase;color:var(--mute);white-space:nowrap}

/* ─────────────────────────  REVEAL  ───────────────────────── */
.js .rv{opacity:0;transform:translateY(22px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.js .rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  .js .rv{opacity:1;transform:none;transition:none}
  *{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
</style>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SportsActivityLocation",
  "name": "FIGHTFIT",
  "slogan": "Train like a fighter.",
  "description": "Premium Combat Fitness in Basel. Striking, Grappling, Strength, Conditioning und Mindset in einem intensiven Ganzkörpertraining.",
  "url": "https://fightfit-bs.ch/",
  "email": "info@fightfit-bs.ch",
  "image": "https://fightfit-bs.ch/assets/fightfit-logo.jpg",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Blotzheimerstrasse",
    "postalCode": "4055",
    "addressLocality": "Basel",
    "addressCountry": "CH"
  },
  "makesOffer": [{
    "@type": "Offer",
    "name": "FIGHTFIT — 12 Week Program",
    "price": "299",
    "priceCurrency": "CHF",
    "availability": "https://schema.org/LimitedAvailability",
    "url": "https://fightfit-bs.ch/#program"
  }]
}
</script>
</head>
<body>

<!-- ══════════════  HEADER  ══════════════ -->
<header class="hdr" id="hdr">
  <div class="hdr__in">
    <a class="mark" href="#top" aria-label="FIGHTFIT — Startseite">FIGHT<span>FIT</span></a>

    <nav class="nav" id="nav" aria-label="Hauptnavigation">
      <a href="#training">Training</a>
      <a href="#coach">Coach</a>
      <?php if ($gallery): ?><a href="#galerie">Galerie</a><?php endif ?>
      <?php if ($events): ?><a href="#termine">Termine</a><?php endif ?>
      <a href="#program">12 Week Program</a>
      <a href="#kontakt">Kontakt</a>
      <a class="btn btn--sm nav__cta" <?= $cta ?>>Secure your spot</a>
    </nav>

    <div style="display:flex;gap:.75rem;align-items:center">
      <a class="btn btn--sm hdr__cta" <?= $cta ?>>Secure your spot</a>
      <button class="burger" id="burger" aria-label="Menü öffnen" aria-controls="nav" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main id="top">

<!-- ══════════════  HERO  ══════════════ -->
<section class="hero">
  <div class="shell">
    <div class="hero__grid">
      <div>
        <p class="eyebrow"><?= h($c['hero']['eyebrow']) ?></p>
        <h1><span class="line"><?= h($c['hero']['line1']) ?></span><span class="line"><?= h($c['hero']['line2']) ?> <span class="gold-fill"><?= h($c['hero']['line2b']) ?></span></span></h1>
        <p class="hero__sub">
          <strong><?= h($c['hero']['lead']) ?></strong>
          <?= nl2br(h($c['hero']['sub'])) ?>
        </p>
        <div class="hero__cta">
          <a class="btn" <?= $cta ?>>Secure your spot</a>
          <a class="btn btn--ghost" href="#fightfit">Was ist FightFit?</a>
        </div>
      </div>

      <figure class="hero__visual rv">
        <img src="assets/fightfit-mark.jpg" width="614" height="339"
             alt="FIGHTFIT Logo — FF Monogramm" fetchpriority="high" decoding="async">
      </figure>
    </div>

    <dl class="facts rv">
      <?php foreach ($c['facts'] as $f): ?>
      <div class="fact"><dt><?= h($f['label']) ?></dt><dd><?= h($f['value']) ?><small><?= h($f['note']) ?></small></dd></div>
      <?php endforeach ?>
    </dl>
  </div>
</section>

<!-- ══════════════  WAS IST FIGHTFIT  ══════════════ -->
<section class="about" id="fightfit">
  <div class="shell about__grid">
    <div class="rv">
      <p class="eyebrow"><?= h($c['about']['eyebrow']) ?></p>
      <h2><?= h($c['about']['h1']) ?><br><?= h($c['about']['h2']) ?><br><span class="gold-fill"><?= h($c['about']['h3']) ?></span></h2>
    </div>
    <div class="about__body rv">
      <?= paragraphs($c['about']['body']) ?>
      <div class="tags">
        <?php foreach ($c['about']['tags'] as $t): ?><span class="tag"><?= h($t) ?></span><?php endforeach ?>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════  DIE 5 BEREICHE  ══════════════ -->
<section class="pillars" id="training">
  <div class="shell">
    <div class="pillars__head rv">
      <div>
        <p class="eyebrow">Die 5 Bereiche</p>
        <h2>Ein Training.<br><span class="gold-fill">Fünf Säulen.</span></h2>
      </div>
      <p class="lede">
        Jede Session kombiniert Technik, Athletik und Kopf — aufgebaut auf den fünf
        Bereichen, die einen Fighter ausmachen.
      </p>
    </div>

    <?php $icons = [
  '<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 5.5A2.5 2.5 0 0 1 9 3h5.5A4.5 4.5 0 0 1 19 7.5v3a4 4 0 0 1-4 4H9.5a3 3 0 0 1-3-3z"/>
          <path d="M8 14.5v2.2a1.8 1.8 0 0 0 1.8 1.8h4.9a1.8 1.8 0 0 0 1.8-1.8v-2.2"/>
          <path d="M9 18.5V20a1 1 0 0 0 1 1h4.5a1 1 0 0 0 1-1v-1.5"/>
          <path d="M19 8.2h.6A1.4 1.4 0 0 1 21 9.6v1.2a1.4 1.4 0 0 1-1.4 1.4H19"/>
        </svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6.5" cy="6" r="2"/>
          <path d="M3 19.5c.4-3 1.9-5 4.4-5.6l3.6-.9 3-2.4"/>
          <path d="M7.4 13.9 5.6 11l1.4-2.4"/>
          <circle cx="18" cy="8.5" r="2"/>
          <path d="M21 19.5c-.3-2.6-1.4-4.6-3.4-5.4l-3.2-1.2-2.4.6"/>
          <path d="M12 19.5h9"/><path d="M3 19.5h5"/>
        </svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 7.5a3 3 0 1 1 6 0"/>
          <path d="M14.6 7.8c2.4 1.2 3.9 3.6 3.9 6.4A6.5 6.5 0 0 1 12 20.9a6.5 6.5 0 0 1-6.5-6.7c0-2.8 1.5-5.2 3.9-6.4z"/>
          <path d="M9.4 7.8h5.2"/>
        </svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12.5h3.8l1.9-5.4 3 11 2.4-7.3 1.5 1.7h6.4"/>
        </svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 12.4c0-4.4-3.6-8-8-8a8 8 0 0 0-8 7.6c0 1.6-.5 2.6-1.4 3.6-.5.5-.3 1.3.4 1.5l1.9.5v2.3a1.6 1.6 0 0 0 1.6 1.6h3.3"/>
          <path d="M10.3 21.5V18"/>
          <path d="M9.6 12.6a2 2 0 1 1 2.2-2.9 2 2 0 1 1 2.9 2.4 2 2 0 1 1-2.6 2.3 2 2 0 1 1-2.5-1.8z"/>
        </svg>'
]; ?>
    <div class="grid5">
      <?php foreach ($c['pillars'] as $i => $p): ?>
      <article class="pillar rv">
        <span class="pillar__n"><?= str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
        <?= $icons[$i] ?? '' ?>
        <h3><?= h($p['title']) ?></h3>
        <p><?= h($p['text']) ?></p>
      </article>
      <?php endforeach ?>
    </div>
  </div>
</section>

<!-- ══════════════  DEIN COACH  ══════════════ -->
<!-- TODO vor dem Livegang: Name, Rolle, Bio, Qualifikationen und Zitat ersetzen.
     Foto: assets/coach.jpg ablegen (Hochformat 4:5, mind. 800x1000px), dann den
     Platzhalter-Block unten durch das auskommentierte <img> ersetzen. -->
<section class="coach" id="coach">
  <div class="shell coach__grid">
    <figure class="portrait rv" style="margin:0">
      <?php if ($c['coach']['photo'] && is_file(__DIR__ . '/assets/' . basename($c['coach']['photo']))): ?>
        <img src="assets/<?= h(basename($c['coach']['photo'])) ?>" alt="<?= h($c['coach']['name']) ?> — <?= h($c['coach']['role']) ?>" decoding="async">
      <?php else: ?>
        <div class="portrait__ph">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="15" rx="2"/>
            <circle cx="12" cy="11.5" r="3.2"/>
            <path d="M7.5 5 9 2.8h6L16.5 5"/>
          </svg>
          <b>Coach-Foto</b>
          <span>Im Admin unter &laquo;Dein Coach&raquo; hochladen</span>
        </div>
      <?php endif ?>
    </figure>

    <div class="coach__body rv">
      <p class="eyebrow">Dein Coach</p>
      <h2><?= h($c['coach']['name']) ?: '<span class="todo">[Name im Admin eintragen]</span>' ?></h2>
      <p class="coach__role"><?= h($c['coach']['role']) ?></p>
      <?= $c['coach']['bio'] ? paragraphs($c['coach']['bio']) : '<p class="lede"><span class="todo">[Bio im Admin eintragen]</span></p>' ?>
      <?php if ($c['coach']['creds']): ?>
      <ul class="creds">
        <?php foreach ($c['coach']['creds'] as $cr): ?>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5"/></svg><?= h($cr) ?></li>
        <?php endforeach ?>
      </ul>
      <?php endif ?>
      <?php if ($c['coach']['quote']): ?>
      <blockquote class="coach__quote"><?= h($c['coach']['quote']) ?></blockquote>
      <?php endif ?>
    </div>
  </div>
</section>

<!-- ══════════════  GALERIE  ══════════════ -->
<?php if ($gallery): ?>
<section class="gallery" id="galerie">
  <div class="shell">
    <div class="gallery__head rv">
      <div>
        <p class="eyebrow"><?= h($c['gallery']['eyebrow']) ?></p>
        <h2><?= h($c['gallery']['title']) ?><br><span class="gold-fill"><?= h($c['gallery']['title_gold']) ?></span></h2>
      </div>
    </div>
    <div class="shots rv">
      <?php foreach ($gallery as $i => $g): ?>
      <button class="shot" type="button" data-i="<?= $i ?>"
              data-src="assets/gallery/<?= h(basename($g['file'])) ?>"
              data-cap="<?= h($g['caption'] ?? '') ?>">
        <img src="assets/gallery/<?= h(basename($g['file'])) ?>" loading="lazy" decoding="async"
             alt="<?= h($g['caption'] ?: 'FIGHTFIT Training') ?>">
      </button>
      <?php endforeach ?>
    </div>
  </div>
</section>
<?php endif ?>

<!-- ══════════════  HAUPTANGEBOT  ══════════════ -->
<section class="program" id="program">
  <div class="shell">
    <div class="offer rv">
      <div class="offer__main">
        <span class="badge"><?= h($c['program']['badge']) ?></span>
        <h2><?= h($c['program']['title']) ?><br><em class="gold-fill"><?= h($c['program']['title_gold']) ?></em></h2>
        <p class="lede"><?= nl2br(h($c['program']['lede'])) ?></p>

        <?php $specIcons = [
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10.5c0 5.2-8 11-8 11s-8-5.8-8-11a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10.5" r="2.8"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 20v-1.8a3.5 3.5 0 0 0-3.5-3.5H6.5A3.5 3.5 0 0 0 3 18.2V20"/><circle cx="9.7" cy="7.5" r="3.5"/><path d="M21 20v-1.8a3.5 3.5 0 0 0-2.7-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/></svg>'
]; ?>
        <ul class="specs">
          <?php foreach ($c['specs'] as $i => $sp): ?>
          <li>
            <?= $specIcons[$i] ?? $specIcons[0] ?>
            <div><b><?= h($sp['label']) ?></b><span><?= h($sp['value']) ?></span></div>
          </li>
          <?php endforeach ?>
        </ul>

        <ul class="check">
          <?php foreach ($c['program']['checks'] as $ck): ?>
          <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5"/></svg><?= h($ck) ?></li>
          <?php endforeach ?>
        </ul>
      </div>

      <aside class="offer__side">
        <p class="eyebrow">Gesamtpreis</p>
        <p class="price"><sup>CHF</sup><?= h($c['program']['price']) ?><span class="gold">.–</span></p>
        <p class="price-note"><?= nl2br(h($c['program']['price_note'])) ?></p>
        <a class="btn" <?= $cta ?>>Secure your spot</a>
      </aside>
    </div>
  </div>
</section>

<!-- ══════════════  FIGHTFIT OPEN  ══════════════ -->
<section class="open" id="open">
  <div class="shell">
    <div class="open__card rv">
      <div>
        <p class="eyebrow"><?= h($c['open']['eyebrow']) ?></p>
        <h2><?= h($c['open']['title']) ?> <span class="gold-fill"><?= h($c['open']['title_gold']) ?></span></h2>
        <p class="lede"><?= nl2br(h($c['open']['lede'])) ?></p>
        <p class="open__meta">
          <?php foreach ($c['open']['tags'] as $t): ?><span><?= h($t) ?></span><?php endforeach ?>
        </p>
      </div>
      <div>
        <p class="open__time"><?= h($c['open']['day']) ?><br><?= h($c['open']['time']) ?><small><?= h($c['open']['note']) ?></small></p>
        <a class="btn btn--ghost btn--sm" <?= $cta ?> style="margin-top:1.4rem">Drop-in anfragen</a>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════  TERMINE  ══════════════ -->
<?php if ($events): ?>
<section class="events" id="termine">
  <div class="shell">
    <div class="events__head rv">
      <div>
        <p class="eyebrow"><?= h($c['events']['eyebrow']) ?></p>
        <h2><?= h($c['events']['title']) ?><br><span class="gold-fill"><?= h($c['events']['title_gold']) ?></span></h2>
      </div>
      <p class="lede"><?= nl2br(h($c['events']['lede'])) ?></p>
    </div>
    <ul class="agenda rv">
      <?php foreach ($events as $e): ?>
      <li>
        <span class="date">
          <b><?= h(event_day($e['date'])) ?></b>
          <span><?= h(event_month($e['date'])) ?></span>
        </span>
        <span class="ev__main">
          <strong><?= h($e['title']) ?></strong>
          <?php if (!empty($e['note'])): ?><span><?= h($e['note']) ?></span><?php endif ?>
        </span>
        <span class="ev__when">
          <?= h(event_weekday($e['date'])) ?>, <?= h(event_day($e['date'])) ?>. <?= h(event_month($e['date'])) ?> <?= h(event_year($e['date'])) ?><?php if (!empty($e['time'])): ?> · <?= h($e['time']) ?><?php endif ?>
        </span>
      </li>
      <?php endforeach ?>
    </ul>
  </div>
</section>
<?php endif ?>

<!-- ══════════════  CTA BAND  ══════════════ -->
<section class="band" id="kontakt">
  <div class="shell band__in rv">
    <p class="eyebrow is-center"><?= h($c['band']['eyebrow']) ?></p>
    <h2><?= h($c['band']['h1']) ?><br><?= h($c['band']['h2']) ?> <span class="gold-fill"><?= h($c['band']['h2b']) ?></span></h2>
    <p>
      <?= nl2br(h($c['band']['text'])) ?>
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:.9rem;justify-content:center">
      <a class="btn" <?= $cta ?>>Secure your spot</a>
      <a class="btn btn--ghost" href="mailto:<?= h($c['contact']['email']) ?>?subject=Frage%20zu%20FIGHTFIT">Frage stellen</a>
    </div>
  </div>
</section>

<?php if ($gallery): ?>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Bildansicht">
  <button class="lb__btn lb__x" type="button" data-lb="close" aria-label="Schliessen">&times;</button>
  <button class="lb__btn lb__prev" type="button" data-lb="prev" aria-label="Vorheriges Bild">&#8249;</button>
  <button class="lb__btn lb__next" type="button" data-lb="next" aria-label="Nächstes Bild">&#8250;</button>
  <div>
    <img id="lbImg" src="" alt="">
    <p class="lb__cap" id="lbCap"></p>
  </div>
</div>
<?php endif ?>

</main>

<!-- ══════════════  FOOTER  ══════════════ -->
<footer class="ft">
  <div class="shell">
    <div class="ft__grid">
      <div>
        <p class="mark" style="font-size:1.5rem">FIGHT<span>FIT</span></p>
        <p class="ft__claim">Train like a fighter.</p>
        <p style="margin-top:1rem;max-width:34ch"><?= h($c['contact']['about']) ?></p>
      </div>
      <div>
        <h4>Training</h4>
        <ul>
          <li><a href="#program">12 Week Program</a></li>
          <li><a href="#open">FightFit Open</a></li>
          <li><a href="#training">Die 5 Bereiche</a></li>
          <?php if ($gallery): ?><li><a href="#galerie">Galerie</a></li><?php endif ?>
          <?php if ($events): ?><li><a href="#termine">Termine</a></li><?php endif ?>
          <li><a href="#coach">Dein Coach</a></li>
          <li><a href="#fightfit">Was ist FightFit</a></li>
        </ul>
      </div>
      <div>
        <h4>Kontakt</h4>
        <ul>
          <li><?= h($c['contact']['street']) ?><br><?= h($c['contact']['city']) ?></li>
          <li><a href="mailto:<?= h($c['contact']['email']) ?>"><?= h($c['contact']['email']) ?></a></li>
          <li><a href="https://fightfit-bs.ch">fightfit-bs.ch</a></li>
        </ul>
      </div>
    </div>
    <div class="ft__bar">
      <span>&copy; <span id="yr">2026</span> FIGHTFIT — Alle Rechte vorbehalten.</span>
      <span><a href="agb.html">AGB</a></span>
      <span>You don't have to fight to train like a fighter.</span>
    </div>
  </div>
</footer>

<script>
(() => {
  "use strict";

  /* sticky header state */
  const hdr = document.getElementById("hdr");
  const onScroll = () => hdr.toggleAttribute("data-stuck", window.scrollY > 12);
  addEventListener("scroll", onScroll, {passive:true});
  onScroll();

  /* mobile nav */
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");
  const setNav = open => {
    nav.toggleAttribute("data-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Menü schliessen" : "Menü öffnen");
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setNav(!nav.hasAttribute("data-open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) setNav(false); });
  addEventListener("keydown", e => { if (e.key === "Escape") setNav(false); });

  /* scroll reveal */
  const items = document.querySelectorAll(".rv");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = Math.min(i * 70, 280) + "ms";
        entry.target.classList.add("in");
        obs.unobserve(entry.target);
      });
    }, {rootMargin:"0px 0px -12% 0px", threshold:0.08});
    items.forEach(el => io.observe(el));
  } else {
    items.forEach(el => el.classList.add("in"));
  }

  /* Galerie-Lightbox */
  const lb = document.getElementById("lb");
  if (lb) {
    const shots = [...document.querySelectorAll(".shot")];
    const img = document.getElementById("lbImg"), cap = document.getElementById("lbCap");
    let idx = 0, lastFocus = null;
    const show = i => {
      idx = (i + shots.length) % shots.length;
      const s = shots[idx];
      img.src = s.dataset.src;
      img.alt = s.dataset.cap || "FIGHTFIT Training";
      cap.textContent = s.dataset.cap || "";
    };
    const open = i => {
      lastFocus = document.activeElement;
      show(i);
      lb.setAttribute("data-open", "");
      document.body.style.overflow = "hidden";
      lb.querySelector('[data-lb="close"]').focus();
    };
    const close = () => {
      lb.removeAttribute("data-open");
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    };
    shots.forEach((s, i) => s.addEventListener("click", () => open(i)));
    lb.addEventListener("click", e => {
      const act = e.target.closest("[data-lb]")?.dataset.lb;
      if (act === "close" || e.target === lb) close();
      else if (act === "prev") show(idx - 1);
      else if (act === "next") show(idx + 1);
    });
    addEventListener("keydown", e => {
      if (!lb.hasAttribute("data-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(idx - 1);
      else if (e.key === "ArrowRight") show(idx + 1);
    });
  }

  document.getElementById("yr").textContent = new Date().getFullYear();
})();
</script>
<script async src="https://tally.so/widgets/embed.js"></script>
</body>
</html>
