/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import applyRouteTrailingSlash from '../applyRouteTrailingSlash';
import type {RouteConfig} from '@docusaurus/types';
import type {ApplyTrailingSlashParams} from '@docusaurus/utils-common';

function route(path: string, subRoutes?: string[]): RouteConfig {
  const result: RouteConfig = {path, component: 'any'};

  if (subRoutes) {
    result.routes = subRoutes.map((subRoute) => route(subRoute));
  }

  return result;
}

function params(
  trailingSlash: boolean | undefined,
  baseUrl: string = '/',
): ApplyTrailingSlashParams {
  return {trailingSlash, baseUrl};
}

describe('applyRouteTrailingSlash', () => {
  it('apply to empty', () => {
    expect(applyRouteTrailingSlash(route(''), params(true))).toEqual(
      route('/'),
    );
    expect(applyRouteTrailingSlash(route(''), params(false))).toEqual(
      route(''),
    );
    expect(applyRouteTrailingSlash(route(''), params(undefined))).toEqual(
      route(''),
    );
  });

  it('apply to /', () => {
    expect(applyRouteTrailingSlash(route('/'), params(true))).toEqual(
      route('/'),
    );
    expect(applyRouteTrailingSlash(route('/'), params(false))).toEqual(
      route('/'),
    );
    expect(applyRouteTrailingSlash(route('/'), params(undefined))).toEqual(
      route('/'),
    );
  });

  it('apply to /abc', () => {
    expect(applyRouteTrailingSlash(route('/abc'), params(true))).toEqual(
      route('/abc/'),
    );
    expect(applyRouteTrailingSlash(route('/abc'), params(false))).toEqual(
      route('/abc'),
    );
    expect(applyRouteTrailingSlash(route('/abc'), params(undefined))).toEqual(
      route('/abc'),
    );
  });

  it('apply to /abc/', () => {
    expect(applyRouteTrailingSlash(route('/abc/'), params(true))).toEqual(
      route('/abc/'),
    );
    expect(applyRouteTrailingSlash(route('/abc/'), params(false))).toEqual(
      route('/abc'),
    );
    expect(applyRouteTrailingSlash(route('/abc/'), params(undefined))).toEqual(
      route('/abc/'),
    );
  });

  it('apply to /abc?search#anchor', () => {
    expect(
      applyRouteTrailingSlash(route('/abc?search#anchor'), params(true)),
    ).toEqual(route('/abc/?search#anchor'));
    expect(
      applyRouteTrailingSlash(route('/abc?search#anchor'), params(false)),
    ).toEqual(route('/abc?search#anchor'));
    expect(
      applyRouteTrailingSlash(route('/abc?search#anchor'), params(undefined)),
    ).toEqual(route('/abc?search#anchor'));
  });

  it('apply to /abc/?search#anchor', () => {
    expect(
      applyRouteTrailingSlash(route('/abc/?search#anchor'), params(true)),
    ).toEqual(route('/abc/?search#anchor'));
    expect(
      applyRouteTrailingSlash(route('/abc/?search#anchor'), params(false)),
    ).toEqual(route('/abc?search#anchor'));
    expect(
      applyRouteTrailingSlash(route('/abc/?search#anchor'), params(undefined)),
    ).toEqual(route('/abc/?search#anchor'));
  });

  it('not apply to /abc/?search#anchor when baseUrl=/abc/', () => {
    const baseUrl = '/abc/';
    expect(
      applyRouteTrailingSlash(
        route('/abc/?search#anchor'),
        params(true, baseUrl),
      ),
    ).toEqual(route('/abc/?search#anchor'));
    expect(
      applyRouteTrailingSlash(
        route('/abc/?search#anchor'),
        params(false, baseUrl),
      ),
    ).toEqual(route('/abc/?search#anchor'));
    expect(
      applyRouteTrailingSlash(
        route('/abc/?search#anchor'),
        params(undefined, baseUrl),
      ),
    ).toEqual(route('/abc/?search#anchor'));
  });

  it('apply to subroutes', () => {
    expect(
      applyRouteTrailingSlash(
        route('/abc', ['/abc/1', '/abc/2']),
        params(true),
      ),
    ).toEqual(route('/abc/', ['/abc/1/', '/abc/2/']));
    expect(
      applyRouteTrailingSlash(
        route('/abc', ['/abc/1', '/abc/2']),
        params(false),
      ),
    ).toEqual(route('/abc', ['/abc/1', '/abc/2']));
    expect(
      applyRouteTrailingSlash(
        route('/abc', ['/abc/1', '/abc/2']),
        params(undefined),
      ),
    ).toEqual(route('/abc', ['/abc/1', '/abc/2']));
  });

  it('apply for complex case', () => {
    expect(
      applyRouteTrailingSlash(
        route('/abc?search#anchor', ['/abc/1?search', '/abc/2#anchor']),
        params(true),
      ),
    ).toEqual(
      route('/abc/?search#anchor', ['/abc/1/?search', '/abc/2/#anchor']),
    );
  });

  it('apply for complex case with baseUrl', () => {
    const baseUrl = '/abc/';
    expect(
      applyRouteTrailingSlash(
        route('/abc/?search#anchor', ['/abc/1?search', '/abc/2#anchor']),
        params(false, baseUrl),
      ),
    ).toEqual(route('/abc/?search#anchor', ['/abc/1?search', '/abc/2#anchor']));
  });
});
