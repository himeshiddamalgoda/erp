import { createSlice } from "@reduxjs/toolkit";
const uiSlice = createSlice({
  name: "ui",
  initialState: {
    mobileNavOpen: false,
    ordersExpanded: true,
    workspace: "sales",
    notice: null,
    noticeSequence: 0,
    editorDirty: false,
  },
  reducers: {
    setMobileNavOpen: (state, action) => {
      state.mobileNavOpen = action.payload;
    },
    toggleOrders: (state) => {
      state.ordersExpanded = !state.ordersExpanded;
    },
    setWorkspace: (state, action) => {
      state.workspace = action.payload;
      state.editorDirty = false;
      state.notice = null;
    },
    notify: (state, action) => {
      state.noticeSequence += 1;
      state.notice = { ...action.payload, id: state.noticeSequence };
    },
    dismissNotice: (state) => {
      state.notice = null;
    },
    setEditorDirty: (state, action) => {
      state.editorDirty = action.payload;
    },
  },
});
export const {
  setMobileNavOpen,
  toggleOrders,
  setWorkspace,
  notify,
  dismissNotice,
  setEditorDirty,
} = uiSlice.actions;
export default uiSlice.reducer;
