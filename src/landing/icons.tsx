import type { SVGProps } from 'react';

// Lucide icons used by the landing page (exact lucide paths: 24×24, stroke 2, round caps).

type Node = [tag: 'path' | 'circle' | 'rect' | 'line', attrs: Record<string, string>];

function icon(name: string, nodes: Node[]) {
  return function LucideIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} className={`lucide lucide-${name} ${props.className ?? ''}`.trim()}>
        {nodes.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
      </svg>
    );
  };
}

export const ArrowRight = icon('arrow-right', [['path', {d: 'M5 12h14'}], ['path', {d: 'm12 5 7 7-7 7'}]]);
export const CirclePlay = icon('circle-play', [['path', {d: 'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z'}], ['circle', {cx: '12', cy: '12', r: '10'}]]);
export const CircleCheck = icon('circle-check', [['circle', {cx: '12', cy: '12', r: '10'}], ['path', {d: 'm9 12 2 2 4-4'}]]);
export const Clock = icon('clock', [['circle', {cx: '12', cy: '12', r: '10'}], ['path', {d: 'M12 6v6l4 2'}]]);
export const ArrowLeftRight = icon('arrow-left-right', [['path', {d: 'M8 3 4 7l4 4'}], ['path', {d: 'M4 7h16'}], ['path', {d: 'm16 21 4-4-4-4'}], ['path', {d: 'M20 17H4'}]]);
export const Award = icon('award', [['path', {d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526'}], ['circle', {cx: '12', cy: '8', r: '6'}]]);
export const Bot = icon('bot', [['path', {d: 'M12 8V4H8'}], ['rect', {width: '16', height: '12', x: '4', y: '8', rx: '2'}], ['path', {d: 'M2 14h2'}], ['path', {d: 'M20 14h2'}], ['path', {d: 'M15 13v2'}], ['path', {d: 'M9 13v2'}]]);
export const CalendarCheck = icon('calendar-check', [['path', {d: 'M8 2v4'}], ['path', {d: 'M16 2v4'}], ['rect', {width: '18', height: '18', x: '3', y: '4', rx: '2'}], ['path', {d: 'M3 10h18'}], ['path', {d: 'm9 16 2 2 4-4'}]]);
export const ChartColumn = icon('chart-column', [['path', {d: 'M3 3v16a2 2 0 0 0 2 2h16'}], ['path', {d: 'M18 17V9'}], ['path', {d: 'M13 17V5'}], ['path', {d: 'M8 17v-3'}]]);
export const CirclePause = icon('circle-pause', [['circle', {cx: '12', cy: '12', r: '10'}], ['line', {x1: '10', x2: '10', y1: '15', y2: '9'}], ['line', {x1: '14', x2: '14', y1: '15', y2: '9'}]]);
export const Cpu = icon('cpu', [['path', {d: 'M12 20v2'}], ['path', {d: 'M12 2v2'}], ['path', {d: 'M17 20v2'}], ['path', {d: 'M17 2v2'}], ['path', {d: 'M2 12h2'}], ['path', {d: 'M2 17h2'}], ['path', {d: 'M2 7h2'}], ['path', {d: 'M20 12h2'}], ['path', {d: 'M20 17h2'}], ['path', {d: 'M20 7h2'}], ['path', {d: 'M7 20v2'}], ['path', {d: 'M7 2v2'}], ['rect', {x: '4', y: '4', width: '16', height: '16', rx: '2'}], ['rect', {x: '8', y: '8', width: '8', height: '8', rx: '1'}]]);
export const ExternalLink = icon('external-link', [['path', {d: 'M15 3h6v6'}], ['path', {d: 'M10 14 21 3'}], ['path', {d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'}]]);
export const EyeOff = icon('eye-off', [['path', {d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'}], ['path', {d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242'}], ['path', {d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'}], ['path', {d: 'm2 2 20 20'}]]);
export const FileText = icon('file-text', [['path', {d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z'}], ['path', {d: 'M14 2v5a1 1 0 0 0 1 1h5'}], ['path', {d: 'M10 9H8'}], ['path', {d: 'M16 13H8'}], ['path', {d: 'M16 17H8'}]]);
export const Handshake = icon('handshake', [['path', {d: 'm11 17 2 2a1 1 0 1 0 3-3'}], ['path', {d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4'}], ['path', {d: 'm21 3 1 11h-2'}], ['path', {d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3'}], ['path', {d: 'M3 4h8'}]]);
export const LockOpen = icon('lock-open', [['rect', {width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2'}], ['path', {d: 'M7 11V7a5 5 0 0 1 9.9-1'}]]);
export const Lock = icon('lock', [['rect', {width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2'}], ['path', {d: 'M7 11V7a5 5 0 0 1 10 0v4'}]]);
export const Menu = icon('menu', [['path', {d: 'M4 5h16'}], ['path', {d: 'M4 12h16'}], ['path', {d: 'M4 19h16'}]]);
export const MessageSquare = icon('message-square', [['path', {d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'}]]);
export const Plus = icon('plus', [['path', {d: 'M5 12h14'}], ['path', {d: 'M12 5v14'}]]);
export const Radio = icon('radio', [['path', {d: 'M16.247 7.761a6 6 0 0 1 0 8.478'}], ['path', {d: 'M19.075 4.933a10 10 0 0 1 0 14.134'}], ['path', {d: 'M4.925 19.067a10 10 0 0 1 0-14.134'}], ['path', {d: 'M7.753 16.239a6 6 0 0 1 0-8.478'}], ['circle', {cx: '12', cy: '12', r: '2'}]]);
export const RotateCcw = icon('rotate-ccw', [['path', {d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'}], ['path', {d: 'M3 3v5h5'}]]);
export const Search = icon('search', [['path', {d: 'm21 21-4.34-4.34'}], ['circle', {cx: '11', cy: '11', r: '8'}]]);
export const Share2 = icon('share-2', [['circle', {cx: '18', cy: '5', r: '3'}], ['circle', {cx: '6', cy: '12', r: '3'}], ['circle', {cx: '18', cy: '19', r: '3'}], ['line', {x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49'}], ['line', {x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49'}]]);
export const ShieldCheck = icon('shield-check', [['path', {d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'}], ['path', {d: 'm9 12 2 2 4-4'}]]);
export const Star = icon('star', [['path', {d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'}]]);
export const TriangleAlert = icon('triangle-alert', [['path', {d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'}], ['path', {d: 'M12 9v4'}], ['path', {d: 'M12 17h.01'}]]);
export const User = icon('user', [['path', {d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'}], ['circle', {cx: '12', cy: '7', r: '4'}]]);
export const Users = icon('users', [['path', {d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'}], ['path', {d: 'M16 3.128a4 4 0 0 1 0 7.744'}], ['path', {d: 'M22 21v-2a4 4 0 0 0-3-3.87'}], ['circle', {cx: '9', cy: '7', r: '4'}]]);
export const X = icon('x', [['path', {d: 'M18 6 6 18'}], ['path', {d: 'm6 6 12 12'}]]);
