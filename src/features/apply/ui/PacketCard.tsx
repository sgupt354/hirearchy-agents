import { Icon } from '../../../ui/Icon';
import type { ApplicationPacket } from '../packet';

/**
 * The application packet inside the referral phones. Seeker: what was prepared, and the yes / no once the referrer asks.
 * Referrer: a request button, then the shared resume summary and intro, only after the seeker says yes.
 */
export function PacketCard({ packet, viewer, referrerName, seekerName, onChange }: {
  packet: ApplicationPacket;
  viewer: 'seeker' | 'referrer';
  referrerName: string;
  seekerName: string;
  onChange: (fn: () => void) => void;
}) {
  const s = packet.summary();
  if (!s) return null;
  const st = packet.state;

  if (viewer === 'seeker') {
    return (
      <div className="packet-card">
        <b><Icon name="file" /> Application packet</b>
        <p>A resume tailored to this role ({s.kept} of your {s.total} bullets, nothing added) and a {s.words}-word intro draft. It stays with your agent{st === 'PREPARED' ? ` unless ${referrerName} asks and you say yes` : ''}.</p>
        {st === 'REQUESTED' && (
          <>
            <p className="packet-ask">{referrerName} asked for it. Share it with {referrerName} only?</p>
            <div className="job-actions">
              <button className="ghost small" onClick={() => onChange(() => packet.consent(packet.seeker, false))}>Keep private</button>
              <button className="cta small" onClick={() => onChange(() => packet.consent(packet.seeker, true))}>Share with {referrerName}</button>
            </div>
          </>
        )}
        {st === 'SHARED' && <p className="packet-done"><Icon name="check" /> Shared with {referrerName} only. Nothing was emailed.</p>}
        {st === 'DECLINED' && <p className="packet-done"><Icon name="lock" /> Kept private.</p>}
      </div>
    );
  }

  const shared = st === 'SHARED' ? packet.view(packet.referrer) : null;
  return (
    <div className="packet-card">
      <b><Icon name="file" /> {seekerName}'s application packet</b>
      {st === 'PREPARED' && (
        <>
          <p>{seekerName}'s agent has a resume tailored to this role and an intro draft. You see them only if you ask and {seekerName} agrees.</p>
          <div className="job-actions">
            <button className="cta small" onClick={() => onChange(() => packet.request(packet.referrer))}>Request resume and intro</button>
          </div>
        </>
      )}
      {st === 'REQUESTED' && <p>Requested. {seekerName} decides whether to share.</p>}
      {st === 'DECLINED' && <p>{seekerName} kept it private. You can still decide on the referral.</p>}
      {shared && (
        <>
          <p>{shared.resume.kept} of {seekerName}'s own bullets, tailored to the role{shared.resume.unmet.length ? `; ${shared.resume.unmet.length} requirement${shared.resume.unmet.length === 1 ? '' : 's'} not shown yet: ${shared.resume.unmet.slice(0, 3).join(', ')}${shared.resume.unmet.length > 3 ? ' and more' : ''}` : ''}.</p>
          <p className="packet-intro">{shared.intro.body.split('\n\n').slice(1, 3).join(' ')}</p>
        </>
      )}
    </div>
  );
}
