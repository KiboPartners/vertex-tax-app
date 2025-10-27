'use strict';

var assert = require('assert');
var WSDL = require('soap').WSDL;
var chai = require('chai');
var expect = chai.expect;

const SAMPLE_ROOT_WSDL_XML = `
<?xml version="1.0"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns1="http://www.sample.io/finance/services/Quote" xmlns:fb="sample:finance:base" xmlns:wsdlsoap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.sample.io/finance/services/Quote">
  <wsdl:types>
    <xsd:schema>
      <xsd:import namespace="sample:finance:base" schemaLocation="../xsd/Finance_Envelope.xsd"/>
    </xsd:schema>
  </wsdl:types>
  <wsdl:message name="getVersionRequest">
    <wsdl:part element="fb:FinanceEnvelope" name="part"/>
  </wsdl:message>
  <wsdl:message name="getVersionResponse">
    <wsdl:part element="fb:FinanceEnvelope" name="FinanceEnvelope"/>
  </wsdl:message>
  <wsdl:portType name="GetVersionWS">
    <wsdl:operation name="getVersion">
      <wsdl:input message="tns1:getVersionRequest" name="getVersionRequest"/>
      <wsdl:output message="tns1:getVersionResponse" name="getVersionResponse"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="GetVersionWSSoapBinding" type="tns1:GetVersionWSS80">
    <wsdlsoap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="getVersion">
      <wsdlsoap:operation soapAction=""/>
      <wsdl:input name="getVersionRequest">
        <wsdlsoap:body use="literal"/>
      </wsdl:input>
      <wsdl:output name="getVersionResponse">
        <wsdlsoap:body use="literal"/>
      </wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="GetVersionWSService">
    <wsdl:port binding="tns1:GetVersionWSSoapBinding" name="GetVersion">
      <wsdlsoap:address location="http://www.sample.io/finance/services/Quote"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>
`;

const SAMPLE_NODE_WSDL_XML= `
<?xml version="1.0"?>
<xsd:schema xmlns="sample:finance:base" xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="sample:finance:base" elementFormDefault="qualified" attributeFormDefault="unqualified" version="1.0" xml:lang="en-us">
  <xsd:include schemaLocation="version/Quote-Version.xsd"/>
  <xsd:element name="FinanceEnvelope">
    <xsd:complexType>
      <xsd:sequence>
        <xsd:choice>
          <xsd:element name="VersionRequest" type="VersionRequestType"/>
          <xsd:element name="VersionResponse" type="VersionResponseType"/>
        </xsd:choice>
        <xsd:element name="CurrentDate" minOccurs="0" type="xsd:date"/>
      </xsd:sequence>
    </xsd:complexType>
  </xsd:element>
</xsd:schema>
`;

const SAMPLE_LEAF_WSDL_XML= `
<?xml version="1.0"?>
<xsd:schema xmlns="sample:finance:base" xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="sample:finance:base" elementFormDefault="qualified" attributeFormDefault="unqualified" version="1.0" xml:lang="en-us">
  <xsd:complexType name="VersionRequestType">
    <xsd:annotation>
      <xsd:documentation>Request for version information</xsd:documentation>
    </xsd:annotation>
  </xsd:complexType>
  <xsd:complexType name="VersionResponseType">
    <xsd:annotation>
      <xsd:documentation>Result of a version lookup</xsd:documentation>
    </xsd:annotation>
    <xsd:element name="VersionNumber" maxOccurs="1" type="xsd:integer"/>
  </xsd:complexType>
</xsd:schema>
`;

var sampleRoot = {
  uri: 'http://www.sample.io/finance/services/Quote',
  xml: SAMPLE_ROOT_WSDL_XML
};

var sampleNode = {
  uri: 'http://www.sample.io/finance/xsd/Finance_Envelope.xsd',
  xml: SAMPLE_NODE_WSDL_XML
};

var sampleLeaf = {
  uri: 'http://www.sample.io/finance/xsd/version/Quote-Version.xsd',
  xml: SAMPLE_LEAF_WSDL_XML
};

describe('buildWsdlReverseDependencyTree', () => {

  var wsdlUtils;

  const rootWsdl = {
    uri: 'root',
    xml: '<root></root>'
  };

  const fooWsdl = {
    uri: 'foo',
    xml: '<foo></foo>'
  };

  const barWsdl = {
    uri: 'bar',
    xml: '<bar></bar>'
  };

  const bazWsdl = {
    uri: 'baz',
    xml: '<baz></baz>'
  };

  before(() => { wsdlUtils = require('../src/util/wsdlUtils'); });

  it('builds a dependency tree as an array', (done) => {
    const root = new WSDL(rootWsdl.xml, rootWsdl.uri, {});
    const foo = new WSDL(fooWsdl.xml, fooWsdl.uri, {});
    const bar = new WSDL(barWsdl.xml, barWsdl.uri, {});
    root._includesWsdl.push(foo, bar);

    var res = wsdlUtils.buildWsdlReverseDependencyTree(root);
    expect(res).to.be.an('array');
    done();
  });

  it('builds a dependency array in reverse order', (done) => {
    const root = new WSDL(rootWsdl.xml, rootWsdl.uri, {});
    const foo = new WSDL(fooWsdl.xml, fooWsdl.uri, {});
    const bar = new WSDL(barWsdl.xml, barWsdl.uri, {});
    const baz = new WSDL(bazWsdl.xml, bazWsdl.uri, {});

    // Reset the xml to the provided XML for purposes of the test as it gets
    // clobbered in the soap library if the XML is invalid WSDL XML.
    root.xml = rootWsdl.xml;
    foo.xml = fooWsdl.xml;
    bar.xml = barWsdl.xml;
    baz.xml = bazWsdl.xml;

    foo._includesWsdl.push(baz);
    bar._includesWsdl.push(baz);
    root._includesWsdl.push(foo, bar);

    var dependencies = wsdlUtils.buildWsdlReverseDependencyTree(root);
    expect(dependencies).to.eql([bazWsdl, fooWsdl, barWsdl, rootWsdl]);
    done();
  });
});

describe('rebuildWsdlFromDependecyTree', () => {

  var wsdlUtils;

  before(() => { wsdlUtils = require('../src/util/wsdlUtils'); });

  it('rebuilds a dependency array into a wsdl', () => {
    var dependencyTree = [sampleLeaf, sampleNode, sampleRoot];
    var failRequestFunc = (args, callback) => {
      console.log("Got request: ", args);
      throw Error("No requests should be made, but one was attempted", "args: ", arg);
    };

    var opts = {
      request: failRequestFunc,
      callback: (err) => {
        if (err !== undefined) {
          throw Error("soap lib WSDL implementation ecountered error: " + err);
        }
      }
    }

    var resWsdlP = wsdlUtils.rebuildWsdlFromDependecyTree(dependencyTree, opts);
    return resWsdlP.then((wsdl) => {
      expect(wsdl.uri, 'Root WSDL uri to be the same as the last URI in the dependency tree').to.eql(sampleRoot.uri);
      expect(wsdl._includesWsdl, 'root WSDL to have one include').to.have.lengthOf(1);

      var nodeWsdl = wsdl._includesWsdl[0];
      expect(nodeWsdl.uri, 'First nested WSDL to be the Node WSDL').to.eql(sampleNode.uri);
      expect(nodeWsdl._includesWsdl, 'node WSDL to have one include').to.have.lengthOf(1);

      var leafWsdl = nodeWsdl._includesWsdl[0];
      expect(leafWsdl.uri, 'Doubly nested WSDL to be the Leaf WSDL').to.eql(sampleLeaf.uri);
      expect(leafWsdl._includesWsdl, 'leaf WSDL to have no includes').to.be.empty;
    });
  });
});
