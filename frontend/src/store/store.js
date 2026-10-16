import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "./ui-slice";
// One store per mounted provider; never share a server-side singleton across users.
export const makeStore = () => configureStore({ reducer: { ui: uiReducer } });
