import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from module_loader import load_classification_job


class _FakeColumn:
    def __init__(self, dtype):
        self.dtype = dtype


class _FakeFeatureFrame:
    def __init__(self):
        self.columns = ["age", "city"]
        self._columns = {
            "age": _FakeColumn("float64"),
            "city": _FakeColumn("object"),
        }

    def __getitem__(self, key):
        return self._columns[key]


class _FakeTrainingFrame:
    def __init__(self):
        self.drop_calls = []

    def __getitem__(self, key):
        if key == "target":
            return "labels"
        raise KeyError(key)

    def drop(self, columns):
        self.drop_calls.append(columns)
        return "features"


class ClassificationJobTests(unittest.TestCase):
    def test_build_pipeline_separates_numeric_and_categorical_columns(self):
        module = load_classification_job()
        classifier = module.TabularClassifier(
            module.ClassificationJobConfig(target_column="target", output_dir=Path("/tmp/out"))
        )

        frame = SimpleNamespace(drop=lambda columns: _FakeFeatureFrame())

        pipeline = classifier._build_pipeline(frame)

        self.assertEqual([step[0] for step in pipeline.steps], ["prep", "model"])
        self.assertEqual(
            pipeline.steps[0][1]["transformers"],
            [
                ("num", {"type": "scaler"}, ["age"]),
                ("cat", {"kwargs": {"handle_unknown": "ignore"}}, ["city"]),
            ],
        )
        self.assertEqual(pipeline.steps[1][1]["kwargs"], {"max_iter": 1000})

    def test_train_uses_split_predicts_and_persists_report(self):
        module = load_classification_job()
        output_dir = Path("/tmp/classification-job")
        classifier = module.TabularClassifier(
            module.ClassificationJobConfig(target_column="target", output_dir=output_dir)
        )
        df = _FakeTrainingFrame()
        fake_pipeline = SimpleNamespace(
            fit=lambda X, y: None,
            predict=lambda X: ["A", "B"],
        )

        with patch.object(classifier, "_build_pipeline", return_value=fake_pipeline) as build, patch.object(
            module,
            "train_test_split",
            return_value=("x_train", "x_val", "y_train", "y_val"),
        ) as split, patch.object(
            module,
            "classification_report",
            return_value={"accuracy": 0.9},
        ) as report, patch.object(
            classifier, "_persist_artifacts"
        ) as persist:
            result = classifier.train(df)

        self.assertEqual(result, {"accuracy": 0.9})
        build.assert_called_once_with(df)
        split.assert_called_once_with(
            "features",
            "labels",
            test_size=0.2,
            random_state=42,
            stratify="labels",
        )
        report.assert_called_once_with("y_val", ["A", "B"], output_dict=True)
        persist.assert_called_once_with({"accuracy": 0.9})
        self.assertIs(classifier.pipeline, fake_pipeline)
        self.assertEqual(df.drop_calls, [["target"]])

    def test_persist_artifacts_writes_metrics_and_model(self):
        module = load_classification_job()

        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            classifier = module.TabularClassifier(
                module.ClassificationJobConfig(target_column="target", output_dir=output_dir)
            )
            classifier.pipeline = {"model": "trained"}
            metrics = {"accuracy": 0.91}

            with patch.object(module.joblib, "dump") as dump:
                classifier._persist_artifacts(metrics)

            dump.assert_called_once_with({"model": "trained"}, output_dir / "model.joblib")
            written_metrics = json.loads((output_dir / "metrics.json").read_text(encoding="utf-8"))
            self.assertEqual(written_metrics, metrics)


if __name__ == "__main__":
    unittest.main()
