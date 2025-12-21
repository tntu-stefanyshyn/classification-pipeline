from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import json

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


@dataclass
class ClassificationJobConfig:
    target_column: str
    output_dir: Path
    test_size: float = 0.2
    random_state: int = 42


class TabularClassifier:
    """Simple tabular classification helper with preprocessing + persistence."""

    def __init__(self, config: ClassificationJobConfig):
        self.config = config
        self.pipeline: Optional[Pipeline] = None

    def _build_pipeline(self, df: pd.DataFrame) -> Pipeline:
        features = df.drop(columns=[self.config.target_column])
        cat_cols: List[str] = [col for col in features.columns if features[col].dtype == 'object']
        num_cols: List[str] = [col for col in features.columns if col not in cat_cols]

        transformers = []
        if num_cols:
            transformers.append(('num', StandardScaler(), num_cols))
        if cat_cols:
            transformers.append(('cat', OneHotEncoder(handle_unknown='ignore'), cat_cols))

        preprocessor = ColumnTransformer(transformers)
        model = LogisticRegression(max_iter=1000)
        return Pipeline([('prep', preprocessor), ('model', model)])

    def train(self, df: pd.DataFrame) -> Dict:
        y = df[self.config.target_column]
        X = df.drop(columns=[self.config.target_column])

        self.pipeline = self._build_pipeline(df)

        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=self.config.test_size, random_state=self.config.random_state, stratify=y
        )

        self.pipeline.fit(X_train, y_train)
        y_pred = self.pipeline.predict(X_val)
        report = classification_report(y_val, y_pred, output_dict=True)

        self._persist_artifacts(report)
        return report

    def _persist_artifacts(self, metrics: Dict) -> None:
        output_dir = self.config.output_dir
        output_dir.mkdir(parents=True, exist_ok=True)

        if self.pipeline:
            model_path = output_dir / 'model.joblib'
            joblib.dump(self.pipeline, model_path)

        metrics_path = output_dir / 'metrics.json'
        metrics_path.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
