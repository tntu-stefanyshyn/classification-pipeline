import importlib.util
import math
import sys
import types
from pathlib import Path
from typing import Dict


ROOT = Path(__file__).resolve().parents[1]


def _make_module(name: str, **attrs: object) -> types.ModuleType:
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    return module


class _DummyEstimator:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def fit(self, *args, **kwargs):
        return self

    def fit_transform(self, values):
        return values

    def predict(self, values):
        return []

    def predict_proba(self, values):
        return []

    def decision_function(self, values):
        return []


class _DummySplitter:
    def __init__(self, *args, **kwargs):
        self.n_splits = kwargs.get("n_splits", 1)

    def split(self, *args, **kwargs):
        return iter([])


class _DummyS3Client:
    def download_fileobj(self, bucket, key, handle):
        return None


class _DummyFrame:
    pass


class _DummyPipeline:
    def __init__(self, steps):
        self.steps = steps
        self.fit_calls = []
        self.predict_calls = []

    def fit(self, *args, **kwargs):
        self.fit_calls.append((args, kwargs))
        return self

    def predict(self, values):
        self.predict_calls.append(values)
        return []


class _DummyGraphqlClient:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint

    def execute(self, query, variables=None, headers=None):
        return {"data": {"ok": True}}


def _load_module(
    module_name: str,
    relative_path: str,
    stubs: Dict[str, types.ModuleType] | None = None,
):
    previous = _install_modules(stubs or {})
    try:
        sys.modules.pop(module_name, None)
        spec = importlib.util.spec_from_file_location(module_name, ROOT / relative_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Unable to load {module_name} module")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        _restore_modules(previous)


def _install_modules(stubs: Dict[str, types.ModuleType]) -> Dict[str, types.ModuleType | None]:
    previous: Dict[str, types.ModuleType | None] = {}
    for name, module in stubs.items():
        previous[name] = sys.modules.get(name)
        sys.modules[name] = module
    return previous


def _restore_modules(previous: Dict[str, types.ModuleType | None]) -> None:
    for name, module in previous.items():
        if module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module


def _base_graphql_stubs() -> Dict[str, types.ModuleType]:
    graphql_pkg = _make_module("graphql")
    graphql_pkg.__path__ = []
    return {
        "graphql": graphql_pkg,
        "graphql.completePipeline": _make_module(
            "graphql.completePipeline", completePipeline=lambda *args, **kwargs: {}
        ),
        "graphql.graphqlRequest": _make_module(
            "graphql.graphqlRequest", graphqlRequest=lambda *args, **kwargs: {}
        ),
        "graphql.updatePipelineProgress": _make_module(
            "graphql.updatePipelineProgress",
            updatePipelineProgress=lambda *args, **kwargs: {},
        ),
        "graphql.updateExperimentProgress": _make_module(
            "graphql.updateExperimentProgress",
            updateExperimentProgress=lambda *args, **kwargs: {},
        ),
        "graphql.updateExperimentOptimizationResult": _make_module(
            "graphql.updateExperimentOptimizationResult",
            updateExperimentOptimizationResult=lambda *args, **kwargs: {},
        ),
        "graphql.updatePipelineOptimizationResult": _make_module(
            "graphql.updatePipelineOptimizationResult",
            updatePipelineOptimizationResult=lambda *args, **kwargs: {},
        ),
    }


def load_compute_handler():
    stubs = _base_graphql_stubs()
    stubs.update(
        {
            "boto3": _make_module("boto3", client=lambda *args, **kwargs: _DummyS3Client()),
            "numpy": _make_module(
                "numpy",
                isfinite=lambda value: math.isfinite(value),
                sign=lambda value: value,
                log1p=lambda value: value,
                abs=abs,
                nanmean=lambda values, axis=None: values,
                nanmedian=lambda values, axis=None: values,
                nanstd=lambda values, axis=None: values,
                asarray=lambda value, dtype=None: value,
                unique=lambda values: list(dict.fromkeys(values)),
            ),
            "pandas": _make_module("pandas", DataFrame=_DummyFrame, Series=_DummyFrame),
            "sklearn": _make_module("sklearn"),
            "sklearn.decomposition": _make_module(
                "sklearn.decomposition",
                FastICA=_DummyEstimator,
                PCA=_DummyEstimator,
            ),
            "sklearn.linear_model": _make_module(
                "sklearn.linear_model", LogisticRegression=_DummyEstimator
            ),
            "sklearn.metrics": _make_module(
                "sklearn.metrics",
                accuracy_score=lambda *args, **kwargs: 0.0,
                confusion_matrix=lambda *args, **kwargs: [],
                f1_score=lambda *args, **kwargs: 0.0,
                roc_auc_score=lambda *args, **kwargs: 0.0,
            ),
            "sklearn.model_selection": _make_module(
                "sklearn.model_selection",
                ShuffleSplit=_DummySplitter,
                StratifiedShuffleSplit=_DummySplitter,
            ),
            "sklearn.neural_network": _make_module(
                "sklearn.neural_network", MLPClassifier=_DummyEstimator
            ),
            "sklearn.preprocessing": _make_module(
                "sklearn.preprocessing", StandardScaler=_DummyEstimator
            ),
            "sklearn.svm": _make_module("sklearn.svm", SVC=_DummyEstimator),
        }
    )

    return _load_module(
        "test_compute_handler_module",
        "src/aws_jobs/compute_handler.py",
        stubs,
    )


def load_optimization_handler():
    return _load_module(
        "test_optimization_handler_module",
        "src/aws_jobs/optimization_handler/optimization_handler.py",
        _base_graphql_stubs(),
    )


def load_graphql_request(relative_path: str, module_name: str):
    return _load_module(
        module_name,
        relative_path,
        {
            "python_graphql_client": _make_module(
                "python_graphql_client",
                GraphqlClient=_DummyGraphqlClient,
            )
        },
    )


def load_graphql_wrapper(relative_path: str, module_name: str):
    return _load_module(module_name, relative_path, _base_graphql_stubs())


def load_classification_job():
    return _load_module(
        "test_classification_job_module",
        "src/aws_jobs/classification_job.py",
        {
            "joblib": _make_module("joblib", dump=lambda *args, **kwargs: None),
            "pandas": _make_module("pandas", DataFrame=_DummyFrame),
            "sklearn": _make_module("sklearn"),
            "sklearn.compose": _make_module(
                "sklearn.compose",
                ColumnTransformer=lambda transformers: {"transformers": transformers},
            ),
            "sklearn.linear_model": _make_module(
                "sklearn.linear_model",
                LogisticRegression=lambda **kwargs: {"kwargs": kwargs},
            ),
            "sklearn.metrics": _make_module(
                "sklearn.metrics",
                classification_report=lambda *args, **kwargs: {"accuracy": 1.0},
            ),
            "sklearn.model_selection": _make_module(
                "sklearn.model_selection",
                train_test_split=lambda *args, **kwargs: ("x_train", "x_val", "y_train", "y_val"),
            ),
            "sklearn.pipeline": _make_module("sklearn.pipeline", Pipeline=_DummyPipeline),
            "sklearn.preprocessing": _make_module(
                "sklearn.preprocessing",
                OneHotEncoder=lambda **kwargs: {"kwargs": kwargs},
                StandardScaler=lambda: {"type": "scaler"},
            ),
        },
    )
