const REQUIREMENT_LABELS = {
    span: "Span",
    cruiseLift: "Cruise CL",
    stability: "Stability",
};

const formatNumber = (value, suffix = "") => {
    if (typeof value !== "number") {
        return "-";
    }

    return `${value}${suffix}`;
};

export default function SimulationReport({ report }) {
    if (!report) {
        return (
            <section className="simulation-report simulation-report--empty" aria-label="Simulation results">
                <div>
                    <p className="panel-kicker">Simulation Results</p>
                    <h2>No OpenVSP run yet</h2>
                </div>
                <p>
                    Run the mission prompt to generate candidate aircraft, OpenVSP artifacts,
                    aerodynamic comparisons, and the final selected design.
                </p>
            </section>
        );
    }

    const selected = report.selectedCandidate;
    const candidates = report.candidates.slice(0, 8);

    return (
        <section className="simulation-report" aria-label="Simulation results">
            <div className="simulation-report__header">
                <div>
                    <p className="panel-kicker">Simulation Results</p>
                    <h2>{selected.name}</h2>
                </div>
                <span className={`run-mode run-mode--${report.mode}`}>
                    {report.mode === "openvsp" ? "OpenVSP" : "Surrogate"}
                </span>
            </div>

            <p className="simulation-report__summary">{report.recommendation}</p>

            <div className="metric-grid">
                <div>
                    <span>L/D</span>
                    <strong>{formatNumber(selected.metrics.liftToDrag)}</strong>
                </div>
                <div>
                    <span>Span</span>
                    <strong>{formatNumber(selected.span, " m")}</strong>
                </div>
                <div>
                    <span>Wing Area</span>
                    <strong>{formatNumber(selected.wingArea, " m2")}</strong>
                </div>
                <div>
                    <span>Static Margin</span>
                    <strong>{formatNumber(selected.metrics.staticMargin, "%")}</strong>
                </div>
            </div>

            <div className="requirement-list" aria-label="Requirement checks">
                {Object.entries(selected.requirements).map(([key, passed]) => (
                    <span className={passed ? "is-pass" : "is-fail"} key={key}>
                        {REQUIREMENT_LABELS[key]} {passed ? "pass" : "fail"}
                    </span>
                ))}
            </div>

            <div className="candidate-table" role="table" aria-label="Top candidate comparison">
                <div className="candidate-table__row candidate-table__row--head" role="row">
                    <span>Name</span>
                    <span>Agent</span>
                    <span>L/D</span>
                    <span>CL</span>
                    <span>Result</span>
                </div>
                {candidates.map((candidate) => (
                    <div className="candidate-table__row" role="row" key={candidate.id}>
                        <span>{candidate.name}</span>
                        <span>{candidate.agentName}</span>
                        <span>{candidate.metrics.liftToDrag}</span>
                        <span>{candidate.metrics.cruiseCl}</span>
                        <span className={candidate.pass ? "is-pass" : "is-fail"}>
                            {candidate.pass ? "Pass" : "Fail"}
                        </span>
                    </div>
                ))}
            </div>

            <div className="artifact-panel">
                <p>
                    OpenVSP status: <strong>{report.openVsp.status}</strong>
                </p>
                <small>{report.openVsp.reason}</small>
                {report.artifacts?.runDirectory && (
                    <small>Artifacts: {report.artifacts.runDirectory}</small>
                )}
            </div>
        </section>
    );
}
