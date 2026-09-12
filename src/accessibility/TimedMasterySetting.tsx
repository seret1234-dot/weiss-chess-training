import { useTimedMastery } from "./TimedMasteryContext"
import "./timedMasterySetting.css"

export default function TimedMasterySetting() {
  const { timedMasteryEnabled, setTimedMasteryEnabled } = useTimedMastery()
  const helpId = "timed-mastery-help"

  return (
    <section className="timed-mastery-setting" aria-labelledby="timed-mastery-heading">
      <div className="timed-mastery-setting__copy">
        <div className="timed-mastery-setting__eyebrow">Training accessibility</div>
        <h2 id="timed-mastery-heading">Timed mastery</h2>
        <p id={helpId}>
          {timedMasteryEnabled
            ? "To earn a perfect solve, begin the correct move within 2 seconds."
            : "Recognition time is not used for mastery. Wrong attempts and hints still prevent a perfect solve."}
        </p>
      </div>
      <label className="timed-mastery-setting__switch">
        <input
          type="checkbox"
          role="switch"
          aria-label="Timed mastery"
          checked={timedMasteryEnabled}
          aria-describedby={helpId}
          onChange={(event) => setTimedMasteryEnabled(event.target.checked)}
        />
        <span aria-hidden="true">{timedMasteryEnabled ? "ON" : "OFF"}</span>
      </label>
    </section>
  )
}
