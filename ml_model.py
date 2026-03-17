import numpy as np
import pandas as pd
import pickle
import os
import warnings
warnings.filterwarnings("ignore")

from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import Matern, WhiteKernel, ConstantKernel
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import r2_score

TARGETS    = ["Tensile", "Youngs", "Hardness", "Buckling"]
UNITS      = {"Tensile": "GPa", "Youngs": "GPa", "Hardness": "HV", "Buckling": "kN"}
FEAT_NAMES = ["Boron Nitride %", "Aluminium Oxide %"]
EXP_W      = 0.90
BN_MIN, BN_MAX = 2.5, 7.5
AO_MIN, AO_MAX = 2.5, 7.5
MODEL_PATH = "models/trained_models.pkl"


def load_data(theory_path, fea_path, exp_path):
    df_theory_raw = pd.read_excel(theory_path)
    ycol = [c for c in df_theory_raw.columns if "modulus" in str(c).lower()][0]
    # Make sure your theory.xlsx has a column exactly named "Buckling Load"
    df_theory = df_theory_raw[["Carbon Fiber", "Boron Nitride", "Aluminium Oxide",
                                "Tensile", ycol, "Hardness", "Buckling Load"]].copy()
    df_theory.columns = ["CF", "BN", "AO", "Tensile", "Youngs", "Hardness", "Buckling"]
    df_theory = df_theory.dropna()

    df_fea_raw = pd.read_excel(fea_path)
    tcols = [c for c in df_fea_raw.columns if "ensile" in str(c)]
    ftc   = next(c for c in tcols if df_fea_raw[c].dropna().mean() < 2)
    df_fea = df_fea_raw[["Carbon Fiber", "Boron Nitride", "Aluminium Oxide", ftc]].copy()
    df_fea.columns = ["CF", "BN", "AO", "Tensile"]
    df_fea = df_fea.dropna()

    df_exp_raw = pd.read_excel(exp_path, header=None)
    hr = next(i for i, row in df_exp_raw.iterrows() if "Carbon" in str(row.values))
    df_exp = df_exp_raw.iloc[hr+1:].reset_index(drop=True).dropna(how="all", axis=1)
    df_exp.columns = ["CF", "BN", "AO", "Tensile", "Youngs", "Hardness", "Buckling"]
    df_exp = df_exp.apply(pd.to_numeric, errors="coerce").dropna()

    return df_theory, df_fea, df_exp


def make_Xy(prop, df_theory, df_fea, df_exp):
    exp     = df_exp[["BN", "AO", prop]].dropna()
    bg_list = [df_theory[["BN", "AO", prop]].dropna()]
    if prop == "Tensile":
        bg_list.append(df_fea[["BN", "AO", prop]].dropna())
    bg  = pd.concat(bg_list, ignore_index=True)
    we  = np.full(len(exp), EXP_W / len(exp))
    wb  = np.full(len(bg),  (1 - EXP_W) / len(bg))
    X   = np.vstack([exp[["BN", "AO"]].values, bg[["BN", "AO"]].values])
    y   = np.concatenate([exp[prop].values, bg[prop].values])
    sw  = np.concatenate([we, wb])
    sw /= sw.mean()
    return X, y, sw, exp[["BN", "AO"]].values, exp[prop].values


def build_gpr(X, y):
    k = ConstantKernel(1.0) * Matern(length_scale=1.5, nu=2.5) + WhiteKernel(0.01)
    m = GaussianProcessRegressor(kernel=k, n_restarts_optimizer=3,
                                 normalize_y=True, random_state=42)
    m.fit(X, y)
    return m


def build_gbm(X, y, sw=None):
    m = GradientBoostingRegressor(n_estimators=60, max_depth=3,
                                  learning_rate=0.1, random_state=42)
    m.fit(X, y, sample_weight=sw)
    return m


def train_models(theory_path, fea_path, exp_path):
    os.makedirs("models", exist_ok=True)
    df_theory, df_fea, df_exp = load_data(theory_path, fea_path, exp_path)

    best_models = {}
    all_r2      = {}

    for prop in TARGETS:
        X_all, y_all, sw, Xe, ye = make_Xy(prop, df_theory, df_fea, df_exp)

        mdl_gpr = build_gpr(Xe, ye)
        mdl_gbm = build_gbm(X_all, y_all, sw)

        r2_gpr = r2_score(ye, mdl_gpr.predict(Xe))
        r2_gbm = r2_score(y_all, mdl_gbm.predict(X_all))

        all_r2[prop] = {"GPR": round(r2_gpr, 4), "GBM": round(r2_gbm, 4)}

        if r2_gpr >= r2_gbm:
            best_models[prop] = ("GPR", mdl_gpr)
        else:
            best_models[prop] = ("GBM", mdl_gbm)

    payload = {
        "models":     best_models,
        "all_r2":     all_r2,
        "exp_data":   df_exp[["BN", "AO"] + TARGETS].to_dict(orient="records"),
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(payload, f)

    return payload


def load_models():
    if not os.path.exists(MODEL_PATH):
        return None
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def predict(bn, ao, payload):
    xi = np.array([[bn, ao]])
    results = {}
    for prop in TARGETS:
        name, mdl = payload["models"][prop]
        if name == "GPR":
            mu, std = mdl.predict(xi, return_std=True)
            results[prop] = {
                "value":       round(float(mu[0]), 5),
                "uncertainty": round(float(std[0]), 5),
                "unit":        UNITS[prop],
                "model":       name,
                "r2":          payload["all_r2"][prop][name],
            }
        else:
            mu  = float(mdl.predict(xi)[0])
            results[prop] = {
                "value":       round(mu, 5),
                "uncertainty": None,
                "unit":        UNITS[prop],
                "model":       name,
                "r2":          payload["all_r2"][prop][name],
            }
    return results


def get_pd_curves(bn, ao, payload):
    sweep = np.linspace(BN_MIN, BN_MAX, 40)
    curves = {}
    for prop in TARGETS:
        name, mdl = payload["models"][prop]
        bn_sw = np.column_stack([sweep, np.full(40, ao)])
        ao_sw = np.column_stack([np.full(40, bn), sweep])
        if name == "GPR":
            mu_bn, sd_bn = mdl.predict(bn_sw, return_std=True)
            mu_ao, sd_ao = mdl.predict(ao_sw, return_std=True)
        else:
            mu_bn = mdl.predict(bn_sw); sd_bn = np.zeros(40)
            mu_ao = mdl.predict(ao_sw); sd_ao = np.zeros(40)
        curves[prop] = {
            "sweep":  sweep.tolist(),
            "bn_mu":  mu_bn.tolist(), "bn_sd": sd_bn.tolist(),
            "ao_mu":  mu_ao.tolist(), "ao_sd": sd_ao.tolist(),
        }
    return curves
