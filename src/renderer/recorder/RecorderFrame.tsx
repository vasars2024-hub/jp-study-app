/**
 * The border around the region being recorded (`?regionRecorder=frame`).
 * Click-through and excluded from capture by main; it only says "this box".
 */
import './recorder.css';

export default function RecorderFrame() {
  return <div className="rr-frame" aria-hidden="true" />;
}
