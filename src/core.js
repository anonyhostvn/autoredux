import get from 'lodash/fp/get';

import { SLICE_VALUE_ERROR } from './errors';

import {
  id,
  isSliceValid,
  isPrimitive,
  isFunction,
  selectIfFunction,
  getSelectorName,
  getActionCreatorName,
  getType
} from './helpers';

// # Selector creation:
const sliceSelector = (slice, fn) => state => fn(state[slice], state);

const createInitSelectors = (slice, initial) =>
  Object.keys(initial).reduce(
    (obj, selector) =>
      slice
        ? Object.assign(obj, {
            [getSelectorName(selector)]: sliceSelector(slice, state =>
              get(selector, state)
            )
          })
        : Object.assign(obj, {
            [getSelectorName(selector)]: state => get(selector, state)
          }),
    {}
  );

const createSliceSelectors = (slice, selectors) =>
  Object.assign(
    Object.keys(selectors).reduce(
      (obj, selector) =>
        slice
          ? Object.assign(obj, {
              [selector]: sliceSelector(slice, selectors[selector])
            })
          : Object.assign(obj, { [selector]: selectors[selector] }),
      {}
    ),
    {
      [getSelectorName(slice)]: sliceSelector(slice, id)
    }
  );
// /selector creation

// # Action creation
const createAction = (slice, action, key, type = getType(slice, action)) => ({
  create: Object.assign(payload => payload, { type }),

  reducer: (state, payload) =>
    !key && isPrimitive(payload)
      ? payload
      : Object.assign({}, state, key ? { [key]: payload } : payload)
});

const getInitialActions = (slice, initial) =>
  Object.keys(initial).reduce((o, key) => {
    const action = getActionCreatorName(key);
    return Object.assign(o, {
      [action]: createAction(slice, action, key)
    });
  }, {});

const addDefaultActions = (slice, initial, actions) => {
  const initialActions = getInitialActions(slice, initial);
  const action = getActionCreatorName(slice);

  return Object.assign(
    {},
    {
      [action]: createAction(slice, action)
    },
    initialActions,
    actions
  );
};

const createMappedActions = (slice, actions) =>
  Object.keys(actions).reduce(
    (obj, action) =>
      Object.assign({}, obj, {
        [action]: Object.assign(
          (...args) => ({
            type: getType(slice, action),
            payload: isFunction(actions[action].create)
              ? actions[action].create(...args)
              : args[0]
          }),
          { type: getType(slice, action) }
        )
      }),
    {}
  );
// /action creation

const checkOptions = ({ slice }) => {
  if (!isSliceValid(slice)) {
    throw new Error(SLICE_VALUE_ERROR);
  }
};

export default function autodux(options = {}) {
  checkOptions(options);

  const { initial = '', actions = {}, selectors = {}, slice } = options;

  const allSelectors = Object.assign(
    {},
    createInitSelectors(slice, initial),
    createSliceSelectors(slice, selectors)
  );

  const allActions = createMappedActions(
    slice,
    addDefaultActions(slice, initial, actions)
  );

  const reducer = (state = initial, { type, payload } = {}) => {
    const [namespace, subType] = type
      ? type.split('/')
      : getType('unknown', 'unknown').split('/');

    const defaultActions = addDefaultActions(slice, initial, {});

    // Look for reducer with top-to-bottom precedence.
    // Fall back to default actions, then undefined.
    // The actions[subType] key can be a function
    // or an object, so we only select the value
    // if it's a function:
    const actionReducer = [
      get(`${subType}.reducer`, actions),
      actions[subType],
      get(`${subType}.reducer`, defaultActions)
    ].reduceRight((f, v) => selectIfFunction(v) || f);

    return namespace === slice && (actions[subType] || defaultActions[subType])
      ? actionReducer
        ? actionReducer(state, payload)
        : Object.assign({}, state, payload)
      : state;
  };

  return {
    initial,
    reducer,
    slice,
    selectors: allSelectors,
    actions: allActions
  };
}

export const assign = key => (state, payload) =>
  Object.assign({}, state, {
    [key]: payload
  });
