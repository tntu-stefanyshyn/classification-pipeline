"""EEG epoch input and fold-local spatial processing."""

from dataclasses import dataclass
from importlib.metadata import version

import numpy as np
import pandas as pd


@dataclass
class Epochs:
    signal: np.ndarray
    labels: pd.Series
    channels: list[str]
    sampling_rate: float
    calibration: np.ndarray
    ids: list[str]

    @classmethod
    def from_dataframe(cls, frame: pd.DataFrame):
        required = {"class", "epoch_id", "sample", "sampling_rate_hz"}
        if missing := required.difference(frame.columns):
            raise ValueError(f"EEG CSV requires columns: {', '.join(sorted(missing))}")
        channels = [name for name in frame if name not in required | {"asr_clean"}]
        if len(channels) < 2:
            raise ValueError("EEG CSV requires at least two channel columns")
        if frame.empty or frame.isna().any().any():
            raise ValueError("EEG CSV contains missing data")
        rates = pd.to_numeric(frame["sampling_rate_hz"]).unique()
        if len(rates) != 1 or not np.isfinite(rates[0]) or rates[0] <= 0:
            raise ValueError("sampling_rate_hz must be positive and constant")
        samples = pd.to_numeric(frame["sample"])
        flags = pd.to_numeric(frame.get("asr_clean", pd.Series(0, index=frame.index)))
        if not flags.isin([0, 1]).all():
            raise ValueError("asr_clean must be 0 or 1")
        values = frame[channels].to_numpy(dtype=float)
        if not np.isfinite(values).all():
            raise ValueError("EEG channels must contain finite values")
        labels = frame["class"].astype(str).str.strip()
        ids = frame["epoch_id"].astype(str).str.strip()
        if labels.eq("").any() or ids.eq("").any():
            raise ValueError("class and epoch_id must be nonempty")

        epochs, epoch_labels, calibration, epoch_ids = [], [], [], []
        for epoch_id, rows in frame.groupby(ids, sort=False).indices.items():
            order = rows[np.argsort(samples.iloc[rows].to_numpy())]
            count = len(order)
            if count < 2 or not np.array_equal(samples.iloc[order], np.arange(count)):
                raise ValueError(f"Epoch {epoch_id}: sample must run from 0 without gaps")
            if epochs and count != epochs[0].shape[1]:
                raise ValueError("EEG epochs must have equal sample counts")
            if labels.iloc[order].nunique() != 1 or flags.iloc[order].nunique() != 1:
                raise ValueError(f"Epoch {epoch_id}: class and asr_clean must be constant")
            epochs.append(values[order].T)
            epoch_labels.append(labels.iloc[order[0]])
            calibration.append(bool(flags.iloc[order[0]]))
            epoch_ids.append(epoch_id)
        return cls(
            np.stack(epochs), pd.Series(epoch_labels), channels, float(rates[0]),
            np.array(calibration), epoch_ids,
        )


def _boolean(settings, key, default):
    value = settings.get(key, default).lower()
    if value not in {"true", "false", "1", "0"}:
        raise ValueError(f"CSP {key} must be a boolean")
    return value in {"true", "1"}


def apply_csp(train, labels, validation, settings):
    from mne.decoding import CSP

    n_components = int(settings.get("n_components", min(4, train.shape[1])))
    if not 1 <= n_components <= train.shape[1]:
        raise ValueError("CSP n_components must be between 1 and the channel count")
    if len(np.unique(labels)) < 2:
        raise ValueError("CSP requires at least two classes in the training split")
    reg = settings.get("reg", "auto").lower()
    if reg not in {"auto", "none", "ledoit_wolf", "oas"}:
        reg = float(reg)
    params = {
        "n_components": n_components,
        "reg": {"auto": "ledoit_wolf", "none": None}.get(reg, reg),
        "log": _boolean(settings, "log", "true"),
        "cov_est": settings.get("cov_est", "concat"),
        "norm_trace": _boolean(settings, "norm_trace", "false"),
        "transform_into": "average_power",
    }
    csp = CSP(**params).fit(train, np.asarray(labels))
    if n_components > csp.filters_.shape[0]:
        raise ValueError("CSP n_components exceeds the fitted signal rank")
    train_features, validation_features = csp.transform(train), csp.transform(validation)
    if not np.isfinite(train_features).all() or not np.isfinite(validation_features).all():
        raise ValueError("CSP produced non-finite component powers")
    return train_features, validation_features, {
        "algorithm": "mne.decoding.CSP", "library_version": version("mne"),
        "parameters": params,
    }


def apply_asr(epochs, calibration, channels, sampling_rate, settings):
    from asrpy import ASR
    from mne import create_info
    from mne.io import RawArray

    cutoff = float(settings.get("cutoff", "20"))
    win_len = float(settings.get("window_ms", "500")) / 1000
    if sampling_rate <= 82:
        raise ValueError("ASRpy requires sampling_rate_hz above 82 Hz for its default filter")
    if not np.isfinite(cutoff) or cutoff <= 0:
        raise ValueError("ASR cutoff must be finite and positive")
    if not np.isfinite(win_len) or round(sampling_rate * win_len) < 2:
        raise ValueError("ASR window_ms must span at least two samples")
    if calibration.shape[1] < max(5 * sampling_rate, 10 * win_len * sampling_rate):
        raise ValueError("ASR requires a marked training epoch of at least 5 seconds and 10 windows")
    if epochs.shape[-1] < max(win_len * sampling_rate, 0.25 * sampling_rate, 33):
        raise ValueError("EEG epoch is too short for the ASR processing window")

    info = create_info(channels, sampling_rate, ch_types="eeg")
    asr = ASR(sfreq=sampling_rate, cutoff=cutoff, win_len=win_len)
    if np.linalg.matrix_rank(calibration) < len(channels):
        raise ValueError("ASR calibration channels must have full rank")
    asr.fit(RawArray(calibration, info, verbose=False))
    if not np.isfinite(asr.M).all() or not np.isfinite(asr.T).all():
        raise ValueError("ASR calibration produced non-finite matrices")
    reconstructed = np.stack([
        asr.transform(RawArray(epoch, info, verbose=False)).get_data()
        for epoch in epochs
    ])
    if reconstructed.shape != epochs.shape or not np.isfinite(reconstructed).all():
        raise ValueError("ASR produced invalid EEG epochs")
    return reconstructed, {
        "algorithm": "asrpy.ASR",
        "library_version": version("asrpy"),
        "parameters": {
            "sfreq": sampling_rate, "cutoff": cutoff, "win_len": win_len,
            "blocksize": asr.blocksize, "win_overlap": asr.win_overlap,
            "max_dropout_fraction": asr.max_dropout_fraction,
            "min_clean_fraction": asr.min_clean_fraction,
            "max_bad_chans": asr.max_bad_chans, "method": asr.method,
            "lookahead": 0.25, "stepsize": 32, "maxdims": 0.66, "mem_splits": 3,
        },
    }
